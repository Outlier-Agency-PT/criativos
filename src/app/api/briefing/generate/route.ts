import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, createServiceSupabase } from "@/lib/api-auth";
import type { BriefingPrompt, BriefingFormat } from "@/lib/briefing-types";

export const maxDuration = 60;

/**
 * POST /api/briefing/generate
 * PREPARA os criativos do modo briefing (sem template) — NÃO gera em background.
 * Cria o projeto generation_mode='briefing', insere 1 criativo pending por prompt
 * aprovado (item × formato) com visual_direction + prompt_used, e retorna os
 * creativeIds. O frontend então chama /api/generate/one com promptOverride por id
 * (mesmo padrão do wizard).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const brandKitId: unknown = body?.brandKitId;
    const personaId: unknown = body?.personaId;
    const projectName: unknown = body?.projectName;
    const formats: BriefingFormat[] = Array.isArray(body?.formats) ? body.formats : [];
    const prompts: BriefingPrompt[] = Array.isArray(body?.prompts) ? body.prompts : [];

    // Imagens de referência (opcional) — rodízio entre criativos via backgrounds.
    const rawRefImages: Array<{ file_path?: string }> = Array.isArray(body?.referenceImages)
      ? body.referenceImages
      : [];
    const imageInstruction: string =
      typeof body?.imageInstruction === "string" ? body.imageInstruction.trim() : "";

    if (typeof brandKitId !== "string" || !brandKitId) {
      return NextResponse.json({ error: "brandKitId obrigatório" }, { status: 400 });
    }
    if (formats.length === 0) {
      return NextResponse.json({ error: "formats obrigatório" }, { status: 400 });
    }
    if (prompts.length === 0) {
      return NextResponse.json({ error: "prompts obrigatório (lista não vazia)" }, { status: 400 });
    }

    const { orgId } = await requireAuth();
    const supabase = await createServiceSupabase();

    // Verificar ownership do brand kit
    const { data: brandKit } = await supabase
      .from("criativos_brand_kits")
      .select("id")
      .eq("id", brandKitId)
      .eq("org_id", orgId)
      .single();
    if (!brandKit) {
      return NextResponse.json({ error: "Brand kit não encontrado" }, { status: 404 });
    }

    // Formato base do projeto (primeiro selecionado)
    const base = formats[0];

    // Dedupe das imagens de referência por file_path, preservando a ordem.
    const seenBg = new Set<string>();
    const refImageRows: Array<{ file_path: string; sort_order: number }> = [];
    for (const raw of rawRefImages) {
      const filePath = typeof raw?.file_path === "string" ? raw.file_path : "";
      if (!filePath || seenBg.has(filePath)) continue;
      seenBg.add(filePath);
      refImageRows.push({ file_path: filePath, sort_order: refImageRows.length });
    }
    const hasRefImages = refImageRows.length > 0;

    // Criar projeto modo briefing
    const { data: project, error: projError } = await supabase
      .from("criativos_generation_projects")
      .insert({
        org_id: orgId,
        name: typeof projectName === "string" && projectName.trim() ? projectName.trim() : "Lote por briefing",
        generation_mode: "briefing",
        brand_kit_id: brandKitId,
        persona_id: typeof personaId === "string" && personaId ? personaId : null,
        format: base.label,
        width: base.width,
        height: base.height,
        selected_formats: formats,
        show_logo: true,
        // Imagens de referência: liga o modo composição pro /one baixar e passar
        // o fundo do rodízio ao modelo. Sem imagens, fica false (comportamento atual).
        use_custom_background: hasRefImages,
        briefing_image_instruction: imageInstruction || null,
        // NOTA: não setamos preferred_model aqui — a coluna não está no schema atual
        // deste banco (migration local órfã). /api/generate/one já usa o default
        // "gemini-3-pro-image-preview" quando project.preferred_model é undefined.
        status: "generating",
      })
      .select("id")
      .single();

    if (projError || !project) {
      return NextResponse.json(
        { error: `Falha ao criar projeto: ${projError?.message ?? "desconhecido"}` },
        { status: 500 },
      );
    }

    // Inserir as imagens de referência no rodízio (criativos_project_backgrounds).
    // O /api/generate/one baixa esses ficheiros do bucket expert-photos quando
    // use_custom_background=true e passa um por criativo (rodízio) ao modelo.
    if (hasRefImages) {
      const bgRows = refImageRows.map((r) => ({
        project_id: project.id,
        file_path: r.file_path,
        sort_order: r.sort_order,
      }));
      const { error: bgError } = await supabase
        .from("criativos_project_backgrounds")
        .insert(bgRows);
      if (bgError) {
        console.error(`[briefing/generate] falha ao inserir imagens de referência: ${bgError.message}`);
      }
    }

    // Inserir 1 criativo pending por prompt aprovado
    const rows = prompts
      .filter((p) => p?.prompt && p?.width && p?.height)
      .map((p) => ({
        project_id: project.id,
        status: "pending",
        width: p.width,
        height: p.height,
        format_label: p.formatLabel,
        visual_direction: p.visualDirection ?? null,
        prompt_used: p.prompt, // prompt aprovado pelo usuário; /one usará via promptOverride
      }));

    const { data: creatives, error: insertError } = await supabase
      .from("criativos_creatives")
      .insert(rows)
      .select("id, prompt_used");

    if (insertError || !creatives) {
      return NextResponse.json(
        { error: `Falha ao criar criativos: ${insertError?.message ?? "desconhecido"}` },
        { status: 500 },
      );
    }

    await supabase
      .from("criativos_generation_projects")
      .update({ total_creatives: creatives.length })
      .eq("id", project.id);

    console.log(
      `[briefing/generate] org=${orgId.slice(0, 8)} project=${project.id.slice(0, 8)} prompts=${prompts.length} creatives=${creatives.length} refImages=${refImageRows.length} instruction=${imageInstruction ? "yes" : "no"}`,
    );

    // Retorna creativeIds + o prompt de cada um, pro frontend chamar /one com promptOverride
    return NextResponse.json({
      projectId: project.id,
      total: creatives.length,
      creatives: creatives.map((c) => ({ id: c.id, prompt: c.prompt_used })),
    });
  } catch (err) {
    console.error(`[briefing/generate] erro: ${err instanceof Error ? err.message : err}`);
    return handleAuthError(err);
  }
}

