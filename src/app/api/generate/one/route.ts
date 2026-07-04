import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { createServiceSupabase } from "@/lib/api-auth";
import { generateWithRotation, getNextAvailableKey } from "@/lib/api-key-rotator";
import { buildPrompt } from "@/lib/prompt-builder";
import { ensureRGB, ensureAllRGB } from "@/lib/image-utils";
import { isImagenModel, getImageCost } from "@/lib/models";
import { REQUIRED_IMAGE_MODEL } from "@/lib/config/image-models";
import { getCreditBalance } from "@/lib/usage";

// Permitir atÃ© 5 minutos para geraÃ§Ã£o de imagem
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
// fundo prÃ³prio (ou trocar de fundo) entre geraÃ§Ãµes reutilizava assets antigos
// (ex.: rgbBackgrounds vazio) â€” o modo composiÃ§Ã£o nÃ£o ativava. (bug 2026-06-18)
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
 * Gera UM criativo de forma sÃ­ncrona.
 * Frontend chama esta rota para cada criativo, controlando o loop.
 * NÃ£o depende de background process â€” resiliente a restart do servidor.
 */
export async function POST(request: NextRequest) {
  // Estado de compensaÃ§Ã£o do gate de crÃ©dito (EP-14): preenchido quando a RPC
  // decrement_credit confirma um dÃ©bito/log ANTES da geraÃ§Ã£o. Se a geraÃ§Ã£o falhar
  // depois, o catch usa isto pra estornar o crÃ©dito (quando debitou de fato) e marcar
  // o log como 'failed' (nunca deleta, CON-007). Honra AC-6: falha nÃ£o cobra o cliente.
  let creditGate: { orgId: string; creativeId: string; debited: boolean } | null = null;

  try {
    const { creativeId, promptOverride, forceVariation, varyClothing } = await request.json();

    if (!creativeId) {
      return NextResponse.json({ error: "creativeId obrigatÃ³rio" }, { status: 400 });
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
      return NextResponse.json({ error: "Criativo nÃ£o encontrado" }, { status: 404 });
    }

    // Buscar projeto e verificar ownership
    const { data: project } = await supabase
      .from("criativos_generation_projects")
      .select("*, persona:criativos_personas(*), brand_kit:criativos_brand_kits(*)")
      .eq("id", creative.project_id)
      .eq("org_id", orgId)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Projeto nÃ£o encontrado ou sem permissÃ£o" }, { status: 404 });
    }

    // QUOTA (EP-14, billing por crÃ©dito prÃ©-pago): pre-check barato de saldo ANTES
    // de gastar com o modelo. credit_balance <= 0 (e nÃ£o-ilimitado) => 429 imediato,
    // sem chamar o Gemini, sem custo (NFR-006). credit_balance IS NULL = ilimitado.
    // O gate atÃ´mico final continua sendo a RPC decrement_credit (abaixo), que Ã© o
    // ponto de verdade sob concorrÃªncia; este pre-check sÃ³ evita o gasto na maioria
    // dos casos de saldo esgotado.
    const preCheckBalance = await getCreditBalance(supabase, orgId);
    if (preCheckBalance !== null && preCheckBalance <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Saldo de crÃ©ditos esgotado, recarregue.",
          creditBalance: preCheckBalance,
        },
        { status: 429 }
      );
    }

    // Marcar como gerando
    await supabase.from("criativos_creatives").update({ status: "generating" }).eq("id", creativeId);

    // EP-13: quando hÃ¡ promptOverride, o prompt vem pronto e a copy nÃ£o Ã© necessÃ¡ria
    // (modo briefing nÃ£o tem copy/template). O wizard sempre tem copy e nunca manda override.
    const hasPromptOverride = typeof promptOverride === "string" && promptOverride.trim().length > 0;

    // Buscar copy especÃ­fica (apenas quando vamos montar o prompt via buildPrompt)
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
      await supabase.from("criativos_creatives").update({ status: "error", error_message: "Copy nÃ£o encontrada" }).eq("id", creativeId);
      return NextResponse.json({ error: "Copy nÃ£o encontrada" }, { status: 404 });
    }

    // Modo composiÃ§Ã£o: fundo prÃ³prio preservado (template empresta sÃ³ layout/texto).
    const useCustomBackground = project.use_custom_background === true;

    // Buscar templates, fotos e (se modo fundo prÃ³prio) fundos
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

    // Assinatura da config de fundo â€” entra na chave do cache. Se mudar (ligar/desligar
    // fundo, trocar fundos, mudar background_mode), o cache antigo Ã© ignorado.
    const bgSignature = `${useCustomBackground ? "bg" : "nobg"}:${project.background_mode || "full"}:${backgrounds.map((b) => b.file_path).join(",")}`;
    const assetsKey = cacheKey(project.id, bgSignature);

    // Download de assets â€” usa cache para nÃ£o re-baixar a cada criativo
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

      // Fundos prÃ³prios â€” preservar ordem (sort_order) pra rodÃ­zio determinÃ­stico por criativo.
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
            // Fallback: tentar bucket legado caso o logo tenha sido criado fora do fluxo padrÃ£o.
            const legacy = await supabase.storage.from("brand-assets").download(project.brand_kit.logo_path);
            if (legacy.data) logoBuffer = Buffer.from(await legacy.data.arrayBuffer());
          })
        : Promise.resolve();

      await Promise.all([...templateDownloads, ...photoDownloads, ...backgroundDownloads, logoDownload]);

      // Converter RGBAâ†’RGB
      rgbTemplates = await ensureAllRGB(templateBuffers);
      rgbPhotos = await ensureAllRGB(expertBuffers);
      rgbBackgrounds = await ensureAllRGB(backgroundBuffers.filter((b): b is Buffer => b !== null));
      rgbLogo = logoBuffer ? await ensureRGB(logoBuffer) : undefined;

      // Cachear para os prÃ³ximos criativos do mesmo projeto (mesma config de fundo)
      projectAssetsCache.set(assetsKey, {
        rgbTemplates, rgbPhotos, rgbBackgrounds, rgbLogo, templateBufferMap,
        timestamp: Date.now(),
      });
    }
    const downloadTime = Date.now() - t0;

    // Modelo preferido â€” prioridade: projeto > Nano Banana Pro (default) > key disponÃ­vel
    const activeKey = await getNextAvailableKey(orgId);
    const preferredModel = project.preferred_model || REQUIRED_IMAGE_MODEL || activeKey?.model;
    const useRefs = !preferredModel || !isImagenModel(preferredModel);

    // VARIAÃ‡ÃƒO: Ã­ndice deste criativo dentro do projeto (ordem de criaÃ§Ã£o).
    // Usado para (1) rodÃ­zio de fotos do expert e (2) variar cenÃ¡rio/composiÃ§Ã£o.
    const { data: siblingIds } = await supabase
      .from("criativos_creatives")
      .select("id")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true });
    const creativeIndex = Math.max(0, (siblingIds ?? []).findIndex((s) => s.id === creative.id));

    // RODÃZIO DE FOTOS: se hÃ¡ vÃ¡rias fotos do expert, cada criativo usa UMA foto
    // diferente, revezando pelo Ã­ndice. (Antes: todas as fotos em todos â†’ o modelo
    // usava sempre a mesma.) MantÃ©m comportamento atual quando hÃ¡ 0 ou 1 foto.
    const rotatedPhotos = rgbPhotos.length === 0
      ? []
      : rgbPhotos.length > 1
        ? [rgbPhotos[creativeIndex % rgbPhotos.length]]
        : rgbPhotos;

    // RODÃZIO DE FUNDO: no modo composiÃ§Ã£o, cada criativo usa um fundo do rodÃ­zio.
    const activeBackground = (useCustomBackground && rgbBackgrounds.length > 0)
      ? rgbBackgrounds[creativeIndex % rgbBackgrounds.length]
      : undefined;
    const hasCustomBackground = !!activeBackground;

    // RODÃZIO DE COR DO BLOCO (layout split-top): se o usuÃ¡rio escolheu vÃ¡rias
    // cores, cada criativo usa uma cor diferente, revezando pelo Ã­ndice. Se
    // escolheu 1, usa sempre ela. Se nenhuma, a IA escolhe da paleta da marca.
    const blockColors = Array.isArray(project.block_colors) ? (project.block_colors as string[]) : [];
    const isSplit = project.background_mode === "split-top" || project.background_mode === "split-bottom";
    const activeBlockColor = (isSplit && blockColors.length > 0)
      ? blockColors[creativeIndex % blockColors.length]
      : undefined;

    // No modo matrix, usar apenas o template especÃ­fico
    const isMatrix = !!creative.template_id;
    const activeTemplateBuffers = isMatrix && creative.template_id && templateBufferMap.has(creative.template_id)
      ? [templateBufferMap.get(creative.template_id)!]
      : rgbTemplates;

    // Mini prompts + anÃ¡lise visual
    const activeTemplateRow = creative.template_id
      ? templates.find((t) => t.template_id === creative.template_id)?.template
      : null;

    const allMiniPrompts = templates
      .map((t) => t.template?.mini_prompt)
      .filter(Boolean)
      .join("\n");

    const activeTemplateMiniPrompt = activeTemplateRow?.mini_prompt || allMiniPrompts;

    // Quando nÃ£o estamos em matrix, agregamos has_logo/has_person dos templates ativos
    const aggregatedTemplate = activeTemplateRow ?? {
      has_logo: templates.some((t) => t.template?.has_logo === true),
      has_person: templates.some((t) => t.template?.has_person === true),
      person_pose: templates.find((t) => t.template?.person_pose)?.template?.person_pose || null,
      logo_position: templates.find((t) => t.template?.logo_position)?.template?.logo_position || null,
    };

    // Extrair dados enriquecidos da anÃ¡lise V2 (graceful fallback se nÃ£o existirem)
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
          // Roupa: lÃª a flag do projeto. Aceita override no body (varyClothing) pra
          // espelhar como forceVariation Ã© tratado vindo do frontend.
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

    // GATE ATÃ”MICO DE CRÃ‰DITO (EP-14): debita 1 crÃ©dito + grava o log de geraÃ§Ã£o na
    // MESMA transaÃ§Ã£o (RPC decrement_credit), ANTES de chamar o modelo. Ã‰ o ponto de
    // verdade sob concorrÃªncia (resolve overspend no Ãºltimo crÃ©dito). Tratamento:
    //   - 'denied'    => saldo zerou (corrida no Ãºltimo crÃ©dito ou jÃ¡ estava 0). 429,
    //                    nenhuma chamada ao provider, nenhum custo.
    //   - 'unlimited' => org ilimitada (credit_balance NULL). Log gravado, sem dÃ©bito. Segue.
    //   - 'ok'        => debitou 1 e logou. Segue.
    // Se a geraÃ§Ã£o falhar DEPOIS (modelo/upload/update), o bloco catch COMPENSA:
    // estorna +1 crÃ©dito (quando houve dÃ©bito real) e marca o log como 'failed', pra
    // honrar "geraÃ§Ã£o que falha nÃ£o debita nem loga como completed" (AC-6). Nunca deleta
    // (CON-007): o log Ã³rfÃ£o Ã© atualizado pra status failed, nÃ£o removido.
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
      // Falha tÃ©cnica do gate (RPC indisponÃ­vel/permissÃ£o). Por seguranÃ§a financeira,
      // NÃƒO gerar sem confirmar o dÃ©bito. Reverte status do criativo e devolve erro.
      console.error(`[generate/one] decrement_credit FALHOU creative=${creative.id.slice(0,8)}: ${debitError.message}`);
      await supabase.from("criativos_creatives").update({ status: "error", error_message: "Falha no gate de crÃ©dito" }).eq("id", creative.id);
      return NextResponse.json({ success: false, error: "Falha ao validar o saldo de crÃ©ditos. Tente novamente." }, { status: 503 });
    }

    const debitStatus = (debitResult as { status?: string; balance?: number | null } | null)?.status;

    if (debitStatus === "denied") {
      // Saldo esgotado (corrida no Ãºltimo crÃ©dito): 429 ANTES de gastar com o modelo.
      console.log(`[generate/one] credito negado creative=${creative.id.slice(0,8)} org=${project.org_id.slice(0,8)}`);
      await supabase.from("criativos_creatives").update({ status: "error", error_message: "Saldo de crÃ©ditos esgotado" }).eq("id", creative.id);
      return NextResponse.json(
        { success: false, error: "Saldo de crÃ©ditos esgotado, recarregue.", creditBalance: 0 },
        { status: 429 }
      );
    }

    // A partir daqui houve dÃ©bito (status 'ok') ou bypass ilimitado ('unlimited').
    // Em ambos os casos a RPC jÃ¡ gravou 1 log 'completed' pra este creative_id.
    // Registra o estado pro catch compensar se a geraÃ§Ã£o falhar (sÃ³ estorna se debitou).
    creditGate = { orgId: project.org_id, creativeId: creative.id, debited: debitStatus === "ok" };

    // Gerar imagem
    const genStart = Date.now();
    const templatesPayload = useRefs ? activeTemplateBuffers : [];
    const expertPayload = useRefs && rotatedPhotos.length > 0 ? rotatedPhotos : undefined;
    const logoPayload = useRefs ? rgbLogo : undefined;
    const backgroundPayload = useRefs ? activeBackground : undefined;
    console.log(`[generate/one] creative=${creative.id.slice(0,8)} project=${project.id.slice(0,8)} | templates=${templatesPayload.length} (${templatesPayload.map(b=>b.length).join(',')}B) | expertPhotos=${expertPayload?.length || 0} (${expertPayload?.map(b=>b.length).join(',') || '-'}B) | background=${backgroundPayload ? backgroundPayload.length+'B' : 'NONE'} | logo=${logoPayload ? logoPayload.length+'B' : 'NONE'} | model=${preferredModel} | useRefs=${useRefs} | prompt=${prompt.length}chars`);
    // TODO: remover apÃ³s debug â€” imprime o prompt completo enviado ao Gemini
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

    // Atualizar registro â€” checar erro (RLS/connection) em vez de ignorar silenciosamente
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

    // LOG DE USO / CUSTO (base de billing): o INSERT do log jÃ¡ foi feito ATOMICAMENTE
    // pela RPC decrement_credit (junto com o dÃ©bito), entÃ£o NÃƒO inserimos de novo aqui
    // (evita duplicar). A RPC logou com o modelo PRETENDIDO (preferredModel) e provider
    // "pending"; aqui sÃ³ atualizamos o log existente pra refletir o modelo/provider/custo
    // EFETIVAMENTE usados (result.*), que podem diferir por causa de fallback do rotator.
    // Best-effort: nunca falha a geraÃ§Ã£o se a atualizaÃ§Ã£o do log nÃ£o gravar.
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
    // COMPENSAÃ‡ÃƒO DO GATE DE CRÃ‰DITO (EP-14, AC-6): se a RPC jÃ¡ confirmou dÃ©bito/log
    // mas a geraÃ§Ã£o falhou depois, o cliente NÃƒO pode ser cobrado por um criativo que
    // nÃ£o saiu. Estorna +1 crÃ©dito (sÃ³ quando debitou de fato, bypass ilimitado nÃ£o
    // mexe em saldo) e marca o log que a RPC gravou como 'failed' (nunca deleta, CON-007),
    // pra que /api/usage (que conta status='completed') nÃ£o cobre essa geraÃ§Ã£o.
    if (creditGate) {
      try {
        const supabase = await createServiceSupabase();
        if (creditGate.debited) {
          // Estorno via RPC atÃ´mica (UPDATE credit_balance = credit_balance + 1 no banco):
          // evita a corrida do read-then-write que estornava de menos sob concorrÃªncia.
          // A prÃ³pria RPC ignora org ilimitada (WHERE credit_balance IS NOT NULL).
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

    const message = err instanceof Error ? err.message : "Erro desconhecido na geraÃ§Ã£o";
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

