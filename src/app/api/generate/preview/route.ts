import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { createServiceSupabase } from "@/lib/api-auth";
import { buildPrompt } from "@/lib/prompt-builder";

/**
 * POST /api/generate/preview
 * Retorna o prompt final que seria enviado à API de geração.
 * Permite visualizar e ajustar antes de gastar créditos.
 */
export async function POST(request: NextRequest) {
  try {
    const {
      brandKitId,
      copies,
      format,
      selectedTemplates,
      showLogo,
      selectedPhotos,
      chatHistory,
      generationMode: requestedMode,
      activeCopyFields,
    } = await request.json();

    const { orgId } = await requireAuth();
    const supabase = await createServiceSupabase();

    // Buscar dados do brand kit
    let brandColors = { primary: "#1a237e", secondary: "#424242", accent: "#ff5722" };
    let brandFonts = { heading: { family: "Inter", weight: "700" }, body: { family: "Inter", weight: "400" } };

    if (brandKitId) {
      const { data: brandKit } = await supabase
        .from("criativos_brand_kits")
        .select("colors, fonts")
        .eq("id", brandKitId)
        .eq("org_id", orgId)
        .single();

      if (brandKit) {
        if (brandKit.colors) brandColors = brandKit.colors;
        if (brandKit.fonts) brandFonts = brandKit.fonts;
      }
    }

    const templateSelection = selectedTemplates ?? [];
    const templateIds = templateSelection.map((t: { id: string }) => t.id);

    const { data: templates } = templateIds.length
      ? await supabase
          .from("criativos_templates")
          .select("id, name, mini_prompt")
          .in("id", templateIds)
      : { data: [] };

    const templateById = new Map<string, { id: string; name: string | null; mini_prompt: string | null }>();
    for (const template of templates ?? []) {
      templateById.set(template.id, template);
    }

    const selectedTemplateDetails = templateIds.map((id: string) => {
      const template = templateById.get(id);
      return {
        id,
        name: template?.name || templateSelection.find((t: { id: string; name?: string }) => t.id === id)?.name || "Template",
        mini_prompt: template?.mini_prompt || templateSelection.find((t: { id: string; mini_prompt?: string }) => t.id === id)?.mini_prompt || "",
      };
    });

    const joinedTemplateMiniPrompt = selectedTemplateDetails
      .map((template: typeof selectedTemplateDetails[0]) => template.mini_prompt)
      .filter(Boolean)
      .join("\n");

    // Chat refinement — apenas mensagens do USUÁRIO (não confirmações do bot)
    const userMessages = (chatHistory || []).filter((m: { role: string }) => m.role === "user");
    const chatRefinement = userMessages.length > 0
      ? userMessages.map((m: { content: string }) => m.content).join("\n")
      : undefined;

    const generationMode = requestedMode === "matrix" || requestedMode === "per_copy"
      ? requestedMode
      : selectedTemplateDetails.length > 1 ? "matrix" : "per_copy";

    const normalizeCopy = (copy: { content: Record<string, string> }, index: number) => {
      const headline = copy.content.headline || copy.content.chamada || Object.values(copy.content).filter(Boolean)[0] || `Copy ${index + 1}`;
      const summary = Object.entries(copy.content)
        .filter(([key]) => key !== "headline" && key !== "chamada")
        .map(([, value]) => value)
        .filter(Boolean)
        .join(" | ")
        .slice(0, 140);

      return {
        index: index + 1,
        headline: typeof headline === "object" ? JSON.stringify(headline) : String(headline),
        summary,
      };
    };

    const hasPhotos = selectedPhotos?.length > 0;
    const templateCount = selectedTemplateDetails.length;

    const buildPreviewPrompt = (
      copy: { content: Record<string, string> },
      templateMiniPrompt?: string,
      promptTemplateCount = templateCount,
    ) => buildPrompt({
      copy: copy.content,
      brand: { colors: brandColors, fonts: brandFonts },
      format: { width: format?.width ?? 1080, height: format?.height ?? 1350 },
      hasExpertPhotos: hasPhotos,
      hasLogo: !!showLogo,
      templateMiniPrompt: templateMiniPrompt || undefined,
      chatRefinement,
      activeCopyFields: Array.isArray(activeCopyFields) && activeCopyFields.length > 0
        ? activeCopyFields
        : undefined,
      imageRefs: {
        templateCount: promptTemplateCount,
        photoCount: selectedPhotos?.length ?? 0,
        hasLogo: !!showLogo,
      },
    });

    const copyUnits = (copies || []).map((copy: { content: Record<string, string> }, index: number) => {
      const preview = normalizeCopy(copy, index);
      const prompt = buildPreviewPrompt(copy, joinedTemplateMiniPrompt || undefined, templateCount);

      return {
        unitIndex: index + 1,
        generationMode: generationMode,
        templateMode: generationMode,
        copyIndex: preview.index,
        copyLabel: preview.headline,
        copySummary: preview.summary,
        templateScope: templateCount > 1 ? "shared" : "single",
        templateCount,
        templateNames: selectedTemplateDetails.map((template: typeof selectedTemplateDetails[0]) => template.name),
        templateIds: selectedTemplateDetails.map((template: typeof selectedTemplateDetails[0]) => template.id),
        prompt,
        charCount: prompt.length,
      };
    });

    const prompts = generationMode === "matrix" && selectedTemplateDetails.length > 0
      ? selectedTemplateDetails.flatMap((template: typeof selectedTemplateDetails[0], templateIndex: number) => (copies || []).map((copy: { content: Record<string, string> }, copyIndex: number) => {
          const preview = normalizeCopy(copy, copyIndex);
          const prompt = buildPreviewPrompt(copy, template.mini_prompt || undefined, 1);

          return {
            unitIndex: templateIndex * (copies?.length || 0) + copyIndex + 1,
            generationMode: "matrix",
            templateMode: "matrix",
            copyIndex: preview.index,
            copyLabel: preview.headline,
            copySummary: preview.summary,
            templateScope: "single",
            templateCount: 1,
            templateId: template.id,
            templateName: template.name,
            templateNames: [template.name],
            templateIndex: templateIndex + 1,
            templateTotal: selectedTemplateDetails.length,
            prompt,
            charCount: prompt.length,
          };
        }))
      : copyUnits;

    return NextResponse.json({
      prompts,
      metadata: {
        generationMode,
        brandColors,
        brandFonts,
        templateCount,
        templateNames: selectedTemplateDetails.map((template: typeof selectedTemplateDetails[0]) => template.name),
        photoCount: selectedPhotos?.length ?? 0,
        hasLogo: !!showLogo,
        format,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

