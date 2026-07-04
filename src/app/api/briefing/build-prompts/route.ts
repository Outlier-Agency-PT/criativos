import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, createServiceSupabase } from "@/lib/api-auth";
import { buildPromptFromBriefingItem, buildBriefingImageReferenceRule } from "@/lib/prompt-builder";
import type { BriefingItem, BriefingFormat, BriefingPrompt } from "@/lib/briefing-types";

export const maxDuration = 60;

/**
 * POST /api/briefing/build-prompts
 * Recebe os itens do briefing + brandKitId + formatos.
 * Gera 1 prompt por item × formato (sem template, brand kit como restrição).
 */
export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const items: BriefingItem[] = Array.isArray(body?.items) ? body.items : [];
    const formats: BriefingFormat[] = Array.isArray(body?.formats) ? body.formats : [];
    const brandKitId: unknown = body?.brandKitId;
    // Imagens de referência do lote (rodízio): instrução do que fazer com elas.
    const hasReferenceImages = body?.hasReferenceImages === true;
    const imageInstruction: string =
      hasReferenceImages && typeof body?.imageInstruction === "string"
        ? body.imageInstruction.trim()
        : "";

    if (items.length === 0) {
      return NextResponse.json({ error: "items obrigatório (lista não vazia)" }, { status: 400 });
    }
    if (formats.length === 0) {
      return NextResponse.json({ error: "formats obrigatório (lista não vazia)" }, { status: 400 });
    }
    if (typeof brandKitId !== "string" || !brandKitId) {
      return NextResponse.json({ error: "brandKitId obrigatório" }, { status: 400 });
    }

    const { orgId } = await requireAuth();
    const supabase = await createServiceSupabase();

    const { data: brandKit, error: bkError } = await supabase
      .from("criativos_brand_kits")
      .select("id, org_id, colors, fonts, logo_path")
      .eq("id", brandKitId)
      .eq("org_id", orgId)
      .single();

    if (bkError || !brandKit) {
      return NextResponse.json({ error: "Brand kit não encontrado" }, { status: 404 });
    }

    const brand = {
      colors: brandKit.colors as { primary: string; secondary: string; accent: string; background?: string; text?: string },
      fonts: brandKit.fonts as { heading: { family: string; weight: string }; body: { family: string; weight: string } },
    };
    const hasLogo = Boolean(brandKit.logo_path);

    let usedReady = 0;
    const prompts: BriefingPrompt[] = [];
    for (const item of items) {
      if (!item?.direcao_visual && !item?.prompt_pronto) continue;
      for (const fmt of formats) {
        // Se o briefing já traz um prompt pronto, usa ELE direto (exato como escrito).
        // Senão, monta o prompt a partir da direção visual + brand kit.
        let prompt: string;
        if (item.prompt_pronto && item.prompt_pronto.trim().length > 0) {
          prompt = item.prompt_pronto.trim();
          // Prompt pronto não passa pelo builder: anexamos a regra da imagem aqui.
          if (hasReferenceImages) {
            prompt = `${prompt}\n\n${buildBriefingImageReferenceRule(imageInstruction)}`;
          }
          usedReady++;
        } else {
          prompt = buildPromptFromBriefingItem({
            visualDirection: item.direcao_visual,
            headline: item.headline,
            subheadline: item.subheadline,
            ponte: item.ponte,
            cta: item.cta,
            brand,
            format: { width: fmt.width, height: fmt.height },
            hasLogo,
            imageInstruction: hasReferenceImages ? imageInstruction : undefined,
          });
        }
        prompts.push({
          itemId: item.id,
          visualDirection: item.direcao_visual || item.titulo || "",
          formatLabel: fmt.label,
          width: fmt.width,
          height: fmt.height,
          prompt,
        });
      }
    }

    console.log(
      `[briefing/build-prompts] org=${orgId.slice(0, 8)} items=${items.length} formats=${formats.length} prompts=${prompts.length} (${usedReady} prontos) refImages=${hasReferenceImages ? "yes" : "no"} brandKit=${brandKitId.slice(0, 8)} time=${Date.now() - started}ms`,
    );

    return NextResponse.json({ prompts });
  } catch (err) {
    console.error(`[briefing/build-prompts] erro: ${err instanceof Error ? err.message : err}`);
    return handleAuthError(err);
  }
}

