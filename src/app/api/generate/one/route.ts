import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { createServiceSupabase } from "@/lib/api-auth";
import { generateWithRotation, getNextAvailableKey } from "@/lib/api-key-rotator";
import { buildPrompt } from "@/lib/prompt-builder";
import { ensureRGB, ensureAllRGB } from "@/lib/image-utils";
import { isImagenModel, getImageCost } from "@/lib/models";
import { REQUIRED_IMAGE_MODEL } from "@/lib/config/image-models";
import { getCreditBalance } from "@/lib/usage";

// Permitir até 5 minutos para geração de imagem
export const maxDuration = 300;

// Cache de assets por projeto (evita re-download a cada criativo)
const projectAssetsCache = new Map<string, {
  rgbTemplates: Buffer[];
  rgbPhotos: Buffer[];
  rgbBackgrounds: Buffer[];
  rgbLogo: Buffer | undefined;
  templateBufferMap: Map<string, Buffer>;
  timestamp: number;
}>();

// Chave do cache: projectId + assinatura da config de fundo. Sem isso, ligar/desligar
// fundo próprio (ou trocar de fundo) entre gerações reutilizava assets antigos
// (ex.: rgbBackgrounds vazio) — o modo composição não ativava. (bug 2026-06-18)
function cacheKey(projectId: string, bgSignature: string) {
  return `${projectId}::${bgSignature}`;
}

// Limpar cache depois de 10 minutos
function getCachedAssets(key: string) {
  const cached = projectAssetsCache.get(key);
  if (cached && Date.now() - cached.timestamp < 600_000) return cached;
  projectAssetsCache.delete(key);
  return null;
}

/**
 * POST /api/generate/one
 * Gera UM criativo de forma síncrona.
 * Frontend chama esta rota para cada criativo, controlando o loop.
 * Não depende de background process — resiliente a restart do servidor.
 */
export async function POST(request: NextRequest) {
  // Estado de compensação do gate de crédito (EP-14): preenchido quando a RPC
  // decrement_credit confirma um débito/log ANTES da geração. Se a geração falhar
  // depois, o catch usa isto pra estornar o crédito (quando debitou de fato) e marcar
  // o log como 'failed' (nunca deleta, CON-007). Honra AC-6: falha não cobra o cliente.
  let creditGate: { orgId: string; creativeId: string; debited: boolean } | null = null;

  try {
    const { creativeId, promptOverride, forceVariation, varyClothing } = await request.json();

    if (!creativeId) {
      return NextResponse.json({ error: "creativeId obrigatório" }, { status: 400 });
    }

    const { orgId } = await requireAuth();
    const supabase = await createServiceSupabase();

    // Buscar o criativo com project_id, copy_id, template_id
    const { data: creative, error: creativeError } = await supabase
      .from("criativos_creatives")
      .select("id, project_id, copy_id, template_id, status, width, height, format_label")
      .eq("id", creativeId)
      .single();

    if (creativeError || !creative) {
      return NextResponse.json({ error: "Criativo não encontrado" }, { status: 404 });
    }

    // Buscar projeto e verificar ownership
    const { data: project } = await supabase
      .from("criativos_generation_projects")
      .select("*, persona:criativos_personas(*), brand_kit:criativos_brand_kits(*)")
      .eq("id", creative.project_id)
      .eq("org_id", orgId)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Projeto não encontrado ou sem permissão" }, { status: 404 });
    }

    // QUOTA (EP-14, billing por crédito pré-pago): pre-check barato de saldo ANTES
    // de gastar com o modelo. credit_balance <= 0 (e não-ilimitado) => 429 imediato,
    // sem chamar o Gemini, sem custo (NFR-006). credit_balance IS NULL = ilimitado.
    // O gate atômico final continua sendo a RPC decrement_credit (abaixo), que é o
    // ponto de verdade sob concorrência; este pre-check só evita o gasto na maioria
    // dos casos de saldo esgotado.
    const preCheckBalance = await getCreditBalance(supabase, orgId);
    if (preCheckBalance !== null && preCheckBalance <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Saldo de créditos esgotado, recarregue.",
          creditBalance: preCheckBalance,
        },
        { status: 429 }
      );
    }

    // Marcar como gerando
    await supabase.from("criativos_creatives").update({ status: "generating" }).eq("id", creativeId);

    // EP-13: quando há promptOverride, o prompt vem pronto e a copy não é necessária
    // (modo briefing não tem copy/template). O wizard sempre tem copy e nunca manda override.
    const hasPromptOverride = typeof promptOverride === "string" && promptOverride.trim().length > 0;

    // Buscar copy específica (apenas quando vamos montar o prompt via buildPrompt)
    let copy: { content?: Record<string, string> } | null = null;
    if (creative.copy_id) {
      const { data } = await supabase
        .from("criativos_project_copies")
        .select("*")
        .eq("id", creative.copy_id)
        .single();
      copy = data;
    }

    if (!copy && !hasPromptOverride) {
      await supabase.from("criativos_creatives").update({ status: "error", error_message: "Copy não encontrada" }).eq("id", creativeId);
      return NextResponse.json({ error: "Copy não encontrada" }, { status: 404 });
    }

    // Modo composição: fundo próprio preservado (template empresta só layout/texto).
    const useCustomBackground = project.use_custom_background === true;

    // Buscar templates, fotos e (se modo fundo próprio) fundos
    const [templatesRes, photosRes, backgroundsRes] = await Promise.all([
      supabase.from("criativos_project_templates").select("*, template:criativos_templates(*)").eq("project_id", project.id).order("sort_order"),
      supabase.from("criativos_project_photos").select("*, photo:criativos_expert_photos(*)").eq("project_id", project.id).order("sort_order"),
      useCustomBackground
        ? supabase.from("criativos_project_backgrounds").select("*").eq("project_id", project.id).order("sort_order")
        : Promise.resolve({ data: [] as { file_path: string }[] }),
    ]);

    const templates = templatesRes.data ?? [];
    const photos = photosRes.data ?? [];
    const backgrounds = (backgroundsRes.data ?? []) as { file_path: string }[];

    // Assinatura da config de fundo — entra na chave do cache. Se mudar (ligar/desligar
    // fundo, trocar fundos, mudar background_mode), o cache antigo é ignorado.
    const bgSignature = `${useCustomBackground ? "bg" : "nobg"}:${project.background_mode || "full"}:${backgrounds.map((b) => b.file_path).join(",")}`;
    const assetsKey = cacheKey(project.id, bgSignature);

    // Download de assets — usa cache para não re-baixar a cada criativo
    const t0 = Date.now();
    let rgbTemplates: Buffer[];
    let rgbPhotos: Buffer[];
    let rgbBackgrounds: Buffer[];
    let rgbLogo: Buffer | undefined;
    let templateBufferMap: Map<string, Buffer>;

    const cached = getCachedAssets(assetsKey);
    if (cached) {
      rgbTemplates = cached.rgbTemplates;
      rgbPhotos = cached.rgbPhotos;
      rgbBackgrounds = cached.rgbBackgrounds;
      rgbLogo = cached.rgbLogo;
      templateBufferMap = cached.templateBufferMap;
    } else {
      templateBufferMap = new Map<string, Buffer>();
      const templateBuffers: Buffer[] = [];

      const templateDownloads = templates
        .filter((tmpl) => tmpl.template?.file_path)
        .map(async (tmpl) => {
          const { data } = await supabase.storage.from("templates").download(tmpl.template.file_path);
          if (data) {
            const buf = Buffer.from(await data.arrayBuffer());
            templateBuffers.push(buf);
            templateBufferMap.set(tmpl.template_id, buf);
          }
        });

      const expertBuffers: Buffer[] = [];
      const photoDownloads = photos
        .filter((p: { photo?: { file_path?: string } }) => p.photo?.file_path)
        .map(async (p: { photo: { file_path: string } }) => {
          const { data } = await supabase.storage.from("expert-photos").download(p.photo.file_path);
          if (data) expertBuffers.push(Buffer.from(await data.arrayBuffer()));
        });

      // Fundos próprios — preservar ordem (sort_order) pra rodízio determinístico por criativo.
      const backgroundBuffers: (Buffer | null)[] = new Array(backgrounds.length).fill(null);
      const backgroundDownloads = backgrounds.map(async (bg, idx) => {
        if (!bg.file_path) return;
        const { data } = await supabase.storage.from("expert-photos").download(bg.file_path);
        if (data) backgroundBuffers[idx] = Buffer.from(await data.arrayBuffer());
      });

      let logoBuffer: Buffer | undefined;
      const logoDownload = (project.show_logo && project.brand_kit?.logo_path)
        ? supabase.storage.from("logos").download(project.brand_kit.logo_path).then(async ({ data }: { data: Blob | null }) => {
            if (data) {
              logoBuffer = Buffer.from(await data.arrayBuffer());
              return;
            }
            // Fallback: tentar bucket legado caso o logo tenha sido criado fora do fluxo padrão.
            const legacy = await supabase.storage.from("brand-assets").download(project.brand_kit.logo_path);
            if (legacy.data) logoBuffer = Buffer.from(await legacy.data.arrayBuffer());
          })
        : Promise.resolve();

      await Promise.all([...templateDownloads, ...photoDownloads, ...backgroundDownloads, logoDownload]);

      // Converter RGBA→RGB
      rgbTemplates = await ensureAllRGB(templateBuffers);
      rgbPhotos = await ensureAllRGB(expertBuffers);
      rgbBackgrounds = await ensureAllRGB(backgroundBuffers.filter((b): b is Buffer => b !== null));
      rgbLogo = logoBuffer ? await ensureRGB(logoBuffer) : undefined;

      // Cachear para os próximos criativos do mesmo projeto (mesma config de fundo)
      projectAssetsCache.set(assetsKey, {
        rgbTemplates, rgbPhotos, rgbBackgrounds, rgbLogo, templateBufferMap,
        timestamp: Date.now(),
      });
    }
    const downloadTime = Date.now() - t0;

    // Modelo preferido — prioridade: projeto > Nano Banana Pro (default) > key disponível
    const activeKey = await getNextAvailableKey(orgId);
    const preferredModel = project.preferred_model || REQUIRED_IMAGE_MODEL || activeKey?.model;
    const useRefs = !preferredModel || !isImagenModel(preferredModel);

    // VARIAÇÃO: índice deste criativo dentro do projeto (ordem de criação).
    // Usado para (1) rodízio de fotos do expert e (2) variar cenário/composição.
    const { data: siblingIds } = await supabase
      .from("criativos_creatives")
      .select("id")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true });
    const creativeIndex = Math.max(0, (siblingIds ?? []).findIndex((s) => s.id === creative.id));

    // RODÍZIO DE FOTOS: se há várias fotos do expert, cada criativo usa UMA foto
    // diferente, revezando pelo índice. (Antes: todas as fotos em todos → o modelo
    // usava sempre a mesma.) Mantém comportamento atual quando há 0 ou 1 foto.
    const rotatedPhotos = rgbPhotos.length === 0
      ? []
      : rgbPhotos.length > 1
        ? [rgbPhotos[creativeIndex % rgbPhotos.length]]
        : rgbPhotos;

    // RODÍZIO DE FUNDO: no modo composição, cada criativo usa um fundo do rodízio.
    const activeBackground = (useCustomBackground && rgbBackgrounds.length > 0)
      ? rgbBackgrounds[creativeIndex % rgbBackgrounds.length]
      : undefined;
    const hasCustomBackground = !!activeBackground;

    // RODÍZIO DE COR DO BLOCO (layout split-top): se o usuário escolheu várias
    // cores, cada criativo usa uma cor diferente, revezando pelo índice. Se
    // escolheu 1, usa sempre ela. Se nenhuma, a IA escolhe da paleta da marca.
    const blockColors = Array.isArray(project.block_colors) ? (project.block_colors as string[]) : [];
    const isSplit = project.background_mode === "split-top" || project.background_mode === "split-bottom";
    const activeBlockColor = (isSplit && blockColors.length > 0)
      ? blockColors[creativeIndex % blockColors.length]
      : undefined;

    // No modo matrix, usar apenas o template específico
    const isMatrix = !!creative.template_id;
    const activeTemplateBuffers = isMatrix && creative.template_id && templateBufferMap.has(creative.template_id)
      ? [templateBufferMap.get(creative.template_id)!]
      : rgbTemplates;

    // Mini prompts + análise visual
    const activeTemplateRow = creative.template_id
      ? templates.find((t) => t.template_id === creative.template_id)?.template
      : null;

    const allMiniPrompts = templates
      .map((t) => t.template?.mini_prompt)
      .filter(Boolean)
      .join("\n");

    const activeTemplateMiniPrompt = activeTemplateRow?.mini_prompt || allMiniPrompts;

    // Quando não estamos em matrix, agregamos has_logo/has_person dos templates ativos
    const aggregatedTemplate = activeTemplateRow ?? {
      has_logo: templates.some((t) => t.template?.has_logo === true),
      has_person: templates.some((t) => t.template?.has_person === true),
      person_pose: templates.find((t) => t.template?.person_pose)?.template?.person_pose || null,
      logo_position: templates.find((t) => t.template?.logo_position)?.template?.logo_position || null,
    };

    // Extrair dados enriquecidos da análise V2 (graceful fallback se não existirem)
    const templateSource = activeTemplateRow ?? ({} as Record<string, unknown>);
    const templateBackground = (templateSource as Record<string, unknown>).background as { type: string; description: string; colors?: string[] } | null ?? null;
    const templateTextLayout = (templateSource as Record<string, unknown>).text_layout as { role: string; text_found: string; position: string; grid_area?: string; size_pct?: number; style?: string; color?: string; lines?: number }[] | null ?? null;
    const templatePerson = (templateSource as Record<string, unknown>).person as { present: boolean; framing?: string; grid_position?: string; coverage_pct?: number; pose?: string; clothing?: string; expression?: string; gaze_direction?: string } | null ?? null;
    const templateSpacing = (templateSource as Record<string, unknown>).spacing as { text_blocks_gap?: string; margin_edges_pct?: number; overall_density?: string } | null ?? null;
    const templateLogoSizePct = (templateSource as Record<string, unknown>).logo_size_pct as number | null ?? null;

    // Dimensoes finais: criativo individual (com width/height proprios) sobrescreve projeto
    const finalWidth = creative.width ?? project.width;
    const finalHeight = creative.height ?? project.height;

    // Build prompt
    const prompt = hasPromptOverride
      ? promptOverride
      : buildPrompt({
          copy: copy!.content!,
          brand: {
            colors: project.brand_kit?.colors ?? { primary: "#1a237e", secondary: "#424242", accent: "#ff5722" },
            fonts: project.brand_kit?.fonts ?? { heading: { family: "Inter", weight: "700" }, body: { family: "Inter", weight: "400" } },
          },
          format: { width: finalWidth, height: finalHeight },
          hasExpertPhotos: rotatedPhotos.length > 0,
          hasLogo: !!rgbLogo,
          variationIndex: creativeIndex,
          forceVariation: forceVariation === true,
          // Roupa: lê a flag do projeto. Aceita override no body (varyClothing) pra
          // espelhar como forceVariation é tratado vindo do frontend.
          varyClothing: varyClothing === true || (project as { vary_clothing?: boolean }).vary_clothing === true,
          hasCustomBackground,
          backgroundMode: project.background_mode === "split-top" || project.background_mode === "split-bottom"
            ? project.background_mode
            : "full",
          blockColor: activeBlockColor,
          templateMiniPrompt: activeTemplateMiniPrompt || undefined,
          templateAnalysis: {
            hasLogo: aggregatedTemplate?.has_logo ?? null,
            logoPosition: aggregatedTemplate?.logo_position ?? null,
            hasPerson: aggregatedTemplate?.has_person ?? null,
            personPose: aggregatedTemplate?.person_pose ?? null,
          },
          templateBackground,
          templateTextLayout,
          templatePerson,
          templateSpacing,
          templateLogoSizePct,
          chatRefinement: project.chat_history?.length
            ? project.chat_history
                .filter((m: { role: string }) => m.role === "user")
                .map((m: { content: string }) => m.content).join("\n")
            : undefined,
          activeCopyFields: Array.isArray(project.active_copy_fields) && project.active_copy_fields.length > 0
            ? project.active_copy_fields
            : undefined,
          imageRefs: useRefs ? {
            templateCount: activeTemplateBuffers.length,
            photoCount: rotatedPhotos.length,
            hasLogo: !!rgbLogo,
          } : undefined,
          expertAdjustments: project.expert_adjustments && (
            (Array.isArray(project.expert_adjustments.presets) && project.expert_adjustments.presets.length > 0) ||
            (typeof project.expert_adjustments.notes === "string" && project.expert_adjustments.notes.trim().length > 0)
          ) ? {
            presets: Array.isArray(project.expert_adjustments.presets) ? project.expert_adjustments.presets : [],
            notes: typeof project.expert_adjustments.notes === "string" ? project.expert_adjustments.notes : "",
          } : undefined,
        });

    // GATE ATÔMICO DE CRÉDITO (EP-14): debita 1 crédito + grava o log de geração na
    // MESMA transação (RPC decrement_credit), ANTES de chamar o modelo. É o ponto de
    // verdade sob concorrência (resolve overspend no último crédito). Tratamento:
    //   - 'denied'    => saldo zerou (corrida no último crédito ou já estava 0). 429,
    //                    nenhuma chamada ao provider, nenhum custo.
    //   - 'unlimited' => org ilimitada (credit_balance NULL). Log gravado, sem débito. Segue.
    //   - 'ok'        => debitou 1 e logou. Segue.
    // Se a geração falhar DEPOIS (modelo/upload/update), o bloco catch COMPENSA:
    // estorna +1 crédito (quando houve débito real) e marca o log como 'failed', pra
    // honrar "geração que falha não debita nem loga como completed" (AC-6). Nunca deleta
    // (CON-007): o log órfão é atualizado pra status failed, não removido.
    const debitModel = preferredModel || REQUIRED_IMAGE_MODEL || "gemini-3-pro-image-preview";
    const debitCost = getImageCost(debitModel);
    const { data: debitResult, error: debitError } = await supabase.rpc("decrement_credit", {
      p_org_id: project.org_id,
      p_creative_id: creative.id,
      p_model: debitModel,
      p_provider: "pending",
      p_cost_usd: debitCost,
    });

    if (debitError) {
      // Falha técnica do gate (RPC indisponível/permissão). Por segurança financeira,
      // NÃO gerar sem confirmar o débito. Reverte status do criativo e devolve erro.
      console.error(`[generate/one] decrement_credit FALHOU creative=${creative.id.slice(0,8)}: ${debitError.message}`);
      await supabase.from("criativos_creatives").update({ status: "error", error_message: "Falha no gate de crédito" }).eq("id", creative.id);
      return NextResponse.json({ success: false, error: "Falha ao validar o saldo de créditos. Tente novamente." }, { status: 503 });
    }

    const debitStatus = (debitResult as { status?: string; balance?: number | null } | null)?.status;

    if (debitStatus === "denied") {
      // Saldo esgotado (corrida no último crédito): 429 ANTES de gastar com o modelo.
      console.log(`[generate/one] credito negado creative=${creative.id.slice(0,8)} org=${project.org_id.slice(0,8)}`);
      await supabase.from("criativos_creatives").update({ status: "error", error_message: "Saldo de créditos esgotado" }).eq("id", creative.id);
      return NextResponse.json(
        { success: false, error: "Saldo de créditos esgotado, recarregue.", creditBalance: 0 },
        { status: 429 }
      );
    }

    // A partir daqui houve débito (status 'ok') ou bypass ilimitado ('unlimited').
    // Em ambos os casos a RPC já gravou 1 log 'completed' pra este creative_id.
    // Registra o estado pro catch compensar se a geração falhar (só estorna se debitou).
    creditGate = { orgId: project.org_id, creativeId: creative.id, debited: debitStatus === "ok" };

    // Gerar imagem
    const genStart = Date.now();
    const templatesPayload = useRefs ? activeTemplateBuffers : [];
    const expertPayload = useRefs && rotatedPhotos.length > 0 ? rotatedPhotos : undefined;
    const logoPayload = useRefs ? rgbLogo : undefined;
    const backgroundPayload = useRefs ? activeBackground : undefined;
    console.log(`[generate/one] creative=${creative.id.slice(0,8)} project=${project.id.slice(0,8)} | templates=${templatesPayload.length} (${templatesPayload.map(b=>b.length).join(',')}B) | expertPhotos=${expertPayload?.length || 0} (${expertPayload?.map(b=>b.length).join(',') || '-'}B) | background=${backgroundPayload ? backgroundPayload.length+'B' : 'NONE'} | logo=${logoPayload ? logoPayload.length+'B' : 'NONE'} | model=${preferredModel} | useRefs=${useRefs} | prompt=${prompt.length}chars`);
    // TODO: remover após debug — imprime o prompt completo enviado ao Gemini
    console.log(`[DEBUG PROMPT GEMINI] creative=${creative.id.slice(0,8)} project=${project.id.slice(0,8)}\n${prompt}`);
    const result = await generateWithRotation(
      project.org_id,
      {
        templates: templatesPayload,
        expertPhotos: expertPayload,
        background: backgroundPayload,
        logo: logoPayload,
        prompt,
        aspectRatio: getAspectRatio(finalWidth, finalHeight),
      },
      preferredModel
    );
    console.log(`[generate/one] OK creative=${creative.id.slice(0,8)} | provider=${result.provider} model=${result.model} fallback=${result.fallbackUsed} image=${result.image.length}B`);
    const generationTime = Date.now() - genStart;

    // Upload imagem
    const filePath = `${project.org_id}/${project.id}/${creative.id}.png`;
    const { error: uploadError } = await supabase.storage.from("creatives").upload(filePath, result.image, {
      contentType: result.mimeType,
      upsert: true,
    });
    if (uploadError) {
      throw new Error(`Falha no upload da imagem: ${uploadError.message}`);
    }

    // Atualizar registro — checar erro (RLS/connection) em vez de ignorar silenciosamente
    const { error: updateError } = await supabase.from("criativos_creatives").update({
      status: "completed",
      file_path: filePath,
      prompt_used: prompt,
      provider_used: result.provider,
      model_used: result.model,
      generation_time_ms: generationTime,
      fallback_used: result.fallbackUsed || false,
    }).eq("id", creative.id);
    if (updateError) {
      console.error(`[generate/one] UPDATE FALHOU creative=${creative.id.slice(0,8)}: ${updateError.message}`);
      throw new Error(`Falha ao atualizar criativo: ${updateError.message}`);
    }

    // LOG DE USO / CUSTO (base de billing): o INSERT do log já foi feito ATOMICAMENTE
    // pela RPC decrement_credit (junto com o débito), então NÃO inserimos de novo aqui
    // (evita duplicar). A RPC logou com o modelo PRETENDIDO (preferredModel) e provider
    // "pending"; aqui só atualizamos o log existente pra refletir o modelo/provider/custo
    // EFETIVAMENTE usados (result.*), que podem diferir por causa de fallback do rotator.
    // Best-effort: nunca falha a geração se a atualização do log não gravar.
    try {
      await supabase
        .from("criativos_generation_logs")
        .update({
          model_used: result.model,
          provider: result.provider,
          cost_usd: getImageCost(result.model),
        })
        .eq("creative_id", creative.id)
        .eq("status", "completed");
    } catch (logErr) {
      console.error(`[generate/one] atualizacao do log de uso falhou creative=${creative.id.slice(0,8)}:`, logErr);
    }

    const totalTime = Date.now() - t0;

    return NextResponse.json({
      success: true,
      creativeId,
      provider: result.provider,
      model: result.model,
      downloadTime,
      generationTime,
      totalTime,
      fallbackUsed: result.fallbackUsed || false,
    });

  } catch (err) {
    // COMPENSAÇÃO DO GATE DE CRÉDITO (EP-14, AC-6): se a RPC já confirmou débito/log
    // mas a geração falhou depois, o cliente NÃO pode ser cobrado por um criativo que
    // não saiu. Estorna +1 crédito (só quando debitou de fato, bypass ilimitado não
    // mexe em saldo) e marca o log que a RPC gravou como 'failed' (nunca deleta, CON-007),
    // pra que /api/usage (que conta status='completed') não cobre essa geração.
    if (creditGate) {
      try {
        const supabase = await createServiceSupabase();
        if (creditGate.debited) {
          // Estorno via RPC atômica (UPDATE credit_balance = credit_balance + 1 no banco):
          // evita a corrida do read-then-write que estornava de menos sob concorrência.
          // A própria RPC ignora org ilimitada (WHERE credit_balance IS NOT NULL).
          const { error: refundErr } = await supabase.rpc("refund_credit", {
            p_org_id: creditGate.orgId,
          });
          if (refundErr) {
            console.error(`[generate/one] refund_credit RPC falhou org=${creditGate.orgId.slice(0,8)}:`, refundErr);
          }
        }
        await supabase
          .from("criativos_generation_logs")
          .update({ status: "failed" })
          .eq("creative_id", creditGate.creativeId)
          .eq("status", "completed");
        console.log(`[generate/one] credito compensado creative=${creditGate.creativeId.slice(0,8)} estornou=${creditGate.debited}`);
      } catch (compErr) {
        console.error(`[generate/one] compensacao de credito FALHOU creative=${creditGate.creativeId.slice(0,8)}:`, compErr);
      }
    }

    // Marcar criativo como erro
    try {
      const { creativeId } = await request.clone().json();
      if (creativeId) {
        const supabase = await createServiceSupabase();
        const message = err instanceof Error ? err.message : "Erro desconhecido";
        await supabase.from("criativos_creatives").update({
          status: "error",
          error_message: message,
        }).eq("id", creativeId);
      }
    } catch { /* ignore cleanup errors */ }

    if (err instanceof Error && (err.message.includes("auth") || err.message.includes("token"))) {
      return handleAuthError(err);
    }

    const message = err instanceof Error ? err.message : "Erro desconhecido na geração";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function getAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.05) return "1:1";
  if (Math.abs(ratio - 0.8) < 0.05) return "4:5";
  if (Math.abs(ratio - 0.5625) < 0.05) return "9:16";
  if (Math.abs(ratio - 1.7778) < 0.1) return "16:9";
  return "1:1";
}

