import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, createServiceSupabase } from "@/lib/api-auth";
import { generateWithRotation, getNextAvailableKey } from "@/lib/api-key-rotator";
import { buildImageEditPrompt } from "@/lib/prompt-builder";
import { ensureAllRGB } from "@/lib/image-utils";
import { isImagenModel } from "@/lib/models";
import { REQUIRED_IMAGE_MODEL } from "@/lib/config/image-models";

export const maxDuration = 300;

function getAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.05) return "1:1";
  if (Math.abs(ratio - 0.8) < 0.05) return "4:5";
  if (Math.abs(ratio - 0.5625) < 0.05) return "9:16";
  if (Math.abs(ratio - 1.7778) < 0.1) return "16:9";
  return "1:1";
}

function combineInstruction(instruction: string, presets: string[]): string {
  const normalizedInstruction = instruction.trim();
  const presetLines = presets.filter(Boolean).map((preset) => `- ${preset}`);

  if (presetLines.length === 0) return normalizedInstruction;
  if (!normalizedInstruction) return `Aplique estes ajustes:\n${presetLines.join("\n")}`;

  return `${normalizedInstruction}\n\nAplique tambem estes ajustes:\n${presetLines.join("\n")}`;
}

export async function POST(request: NextRequest) {
  let creativeId: string | null = null;
  let originalStatus: string | null = null;

  try {
    // Aceita JSON (sem foto) ou multipart/form-data (com referencePhoto)
    const contentType = request.headers.get("content-type") || "";
    let instruction = "";
    let presets: string[] = [];
    let referencePhotoBuffer: Buffer | undefined;

    if (contentType.includes("multipart/form-data")) {
      const fd = await request.formData();
      creativeId = typeof fd.get("creativeId") === "string" ? (fd.get("creativeId") as string) : null;
      instruction = typeof fd.get("instruction") === "string" ? (fd.get("instruction") as string) : "";
      const presetsRaw = fd.get("presets");
      if (typeof presetsRaw === "string") {
        try {
          const parsed = JSON.parse(presetsRaw);
          if (Array.isArray(parsed)) presets = parsed.filter((p): p is string => typeof p === "string");
        } catch {}
      }
      const photo = fd.get("referencePhoto");
      if (photo instanceof File && photo.size > 0) {
        if (photo.size > 8 * 1024 * 1024) {
          return NextResponse.json({ success: false, error: "Foto de referencia muito grande (max 8MB)" }, { status: 400 });
        }
        referencePhotoBuffer = Buffer.from(await photo.arrayBuffer());
      }
    } else {
      const body = await request.json() as Record<string, unknown>;
      creativeId = typeof body.creativeId === "string" ? body.creativeId : null;
      instruction = typeof body.instruction === "string" ? body.instruction : "";
      presets = Array.isArray(body.presets)
        ? body.presets.filter((item: unknown): item is string => typeof item === "string")
        : [];
    }

    if (!creativeId) {
      return NextResponse.json({ success: false, error: "creativeId obrigatorio" }, { status: 400 });
    }

    let finalInstruction = combineInstruction(instruction, presets);
    // Se subiu foto de referencia mas nao escolheu preset/instrucao explicita, injeta instrucao automatica de face swap
    if (!finalInstruction.trim() && referencePhotoBuffer) {
      finalInstruction =
        "Trocar o rosto/identidade da pessoa no criativo pelo rosto da foto de referencia anexada (face swap). " +
        "Manter EXATAMENTE: a mesma pose, enquadramento, iluminacao, roupa, cenario e composicao do criativo atual. " +
        "Usar a foto de referencia APENAS como fonte de identidade facial (tracos, pele, cabelo). " +
        "Nao copiar a roupa, o fundo nem a pose da foto de referencia.";
    } else if (referencePhotoBuffer) {
      // Tem foto + instrucao: reforcar uso da foto como referencia facial
      finalInstruction +=
        "\n\nIMPORTANTE: usar a foto de referencia anexada como fonte de identidade facial (face swap) na pessoa do criativo, mantendo pose/roupa/cenario do criativo atual.";
    }
    if (!finalInstruction.trim()) {
      return NextResponse.json({ success: false, error: "Informe pelo menos um ajuste para editar a imagem" }, { status: 400 });
    }

    const { orgId } = await requireAuth();
    const supabase = await createServiceSupabase();

    const { data: creative, error: creativeError } = await supabase
      .from("criativos_creatives")
      .select("id, project_id, template_id, file_path, prompt_used, status")
      .eq("id", creativeId)
      .single();

    if (creativeError || !creative?.file_path) {
      return NextResponse.json({ success: false, error: "Criativo nao encontrado" }, { status: 404 });
    }

    originalStatus = creative.status;

    const { data: project } = await supabase
      .from("criativos_generation_projects")
      .select("id, org_id, width, height, expert_adjustments, show_logo, brand_kit:criativos_brand_kits(*)")
      .eq("id", creative.project_id)
      .eq("org_id", orgId)
      .single();

    if (!project) {
      return NextResponse.json({ success: false, error: "Projeto nao encontrado ou sem permissao" }, { status: 404 });
    }

    // Normalizar brand_kit (Supabase as vezes retorna array)
    const rawBrandKit = (project as unknown as { brand_kit?: unknown }).brand_kit;
    const brandKit: Record<string, unknown> | null = Array.isArray(rawBrandKit)
      ? ((rawBrandKit[0] as Record<string, unknown>) ?? null)
      : ((rawBrandKit as Record<string, unknown> | null) ?? null);

    await supabase
      .from("criativos_creatives")
      .update({ status: "generating", error_message: null })
      .eq("id", creativeId);

    const currentImageDownload = await supabase.storage.from("creatives").download(creative.file_path);
    if (!currentImageDownload.data) {
      throw new Error("Nao foi possivel baixar a imagem atual do criativo");
    }
    const currentImageBuffer = Buffer.from(await currentImageDownload.data.arrayBuffer());

    const [templatesRes, photosRes] = await Promise.all([
      supabase
        .from("criativos_project_templates")
        .select("template_id, template:criativos_templates(file_path)")
        .eq("project_id", project.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("criativos_project_photos")
        .select("photo:criativos_expert_photos(file_path)")
        .eq("project_id", project.id)
        .order("sort_order", { ascending: true }),
    ]);

    const templateCandidates = ((templatesRes.data ?? []) as Array<{
      template_id: string;
      template: { file_path: string | null } | { file_path: string | null }[] | null;
    }>).flatMap((row) => {
      const template = Array.isArray(row.template) ? row.template[0] : row.template;
      return template?.file_path ? [{ template_id: row.template_id, file_path: template.file_path }] : [];
    });
    const activeTemplateRows = creative.template_id
      ? templateCandidates.filter((row) => row.template_id === creative.template_id)
      : templateCandidates;

    const templateDownloads = await Promise.all(
      activeTemplateRows.map(async (row) => {
        const { data } = await supabase.storage.from("templates").download(row.file_path);
        return data ? Buffer.from(await data.arrayBuffer()) : null;
      })
    );
    const templateBuffers: Buffer[] = templateDownloads.reduce<Buffer[]>((acc, buffer) => {
      if (buffer) acc.push(buffer);
      return acc;
    }, []);

    const photoDownloads = await Promise.all(
      ((photosRes.data ?? []) as Array<{
        photo: { file_path: string | null } | { file_path: string | null }[] | null;
      }>)
        .flatMap((row) => {
          const photo = Array.isArray(row.photo) ? row.photo[0] : row.photo;
          return photo?.file_path ? [photo.file_path] : [];
        })
        .map(async (row) => {
          const { data } = await supabase.storage.from("expert-photos").download(row);
          return data ? Buffer.from(await data.arrayBuffer()) : null;
        })
    );
    const expertBuffersFromProject: Buffer[] = photoDownloads.reduce<Buffer[]>((acc, buffer) => {
      if (buffer) acc.push(buffer);
      return acc;
    }, []);

    // Se subiu foto de referencia nesta edicao, ela TEM PRIORIDADE: substitui as fotos do projeto.
    // Caso contrario, usa as fotos do projeto normalmente.
    const expertBuffers = referencePhotoBuffer ? [referencePhotoBuffer] : expertBuffersFromProject;

    // Baixar logo do brand_kit (se show_logo estiver ativo)
    let logoBuffer: Buffer | undefined;
    const logoPath = (brandKit as { logo_path?: string } | null)?.logo_path;
    if ((project as { show_logo?: boolean }).show_logo && logoPath) {
      const { data: logoData } = await supabase.storage.from("logos").download(logoPath);
      if (logoData) {
        logoBuffer = Buffer.from(await logoData.arrayBuffer());
      } else {
        // Fallback bucket legado
        const { data: legacyData } = await supabase.storage.from("brand-assets").download(logoPath);
        if (legacyData) logoBuffer = Buffer.from(await legacyData.arrayBuffer());
      }
    }

    const rgbReferenceImages = await ensureAllRGB([currentImageBuffer, ...templateBuffers]);
    const rgbCurrentImage = rgbReferenceImages[0];
    const rgbTemplates = rgbReferenceImages.slice(1);
    const rgbPhotos = await ensureAllRGB(expertBuffers);
    const rgbLogo = logoBuffer ? (await ensureAllRGB([logoBuffer]))[0] : undefined;

    const projectAdjustments = (project as { expert_adjustments?: { presets?: string[]; notes?: string } | null }).expert_adjustments;
    const bkColors = (brandKit as { colors?: { primary?: string; secondary?: string; accent?: string; background?: string } } | null)?.colors;
    const bkFonts = (brandKit as { fonts?: { heading?: { family?: string; weight?: string }; body?: { family?: string; weight?: string } } } | null)?.fonts;
    const prompt = buildImageEditPrompt({
      originalPrompt: creative.prompt_used,
      userInstruction: finalInstruction,
      hasExpertPhotos: rgbPhotos.length > 0,
      hasLogo: !!rgbLogo,
      templateReferenceCount: rgbTemplates.length,
      expertPhotoMode: referencePhotoBuffer ? "replace" : "preserve",
      brand: bkColors ? {
        colors: {
          primary: bkColors.primary || "#000000",
          secondary: bkColors.secondary || "#666666",
          accent: bkColors.accent || "#ff0000",
          background: bkColors.background,
        },
        fonts: {
          heading: {
            family: bkFonts?.heading?.family || "Inter",
            weight: bkFonts?.heading?.weight || "700",
          },
          body: {
            family: bkFonts?.body?.family || "Inter",
            weight: bkFonts?.body?.weight || "400",
          },
        },
      } : undefined,
      expertAdjustments: projectAdjustments && (
        (Array.isArray(projectAdjustments.presets) && projectAdjustments.presets.length > 0) ||
        (typeof projectAdjustments.notes === "string" && projectAdjustments.notes.trim().length > 0)
      ) ? {
        presets: Array.isArray(projectAdjustments.presets) ? projectAdjustments.presets : [],
        notes: typeof projectAdjustments.notes === "string" ? projectAdjustments.notes : "",
      } : undefined,
    });

    const activeKey = await getNextAvailableKey(orgId);
    // Edit sempre exclui Imagen (não suporta image input). Coluna preferred_model pendente de migration — usa default.
    void activeKey; void isImagenModel;
    const preferredModel: string = REQUIRED_IMAGE_MODEL;

    const templatesPayload = [rgbCurrentImage, ...rgbTemplates];
    const expertPayload = rgbPhotos.length > 0 ? rgbPhotos : undefined;
    console.log(`[edit-one] creative=${creativeId.slice(0,8)} project=${project.id.slice(0,8)} | currentImage=${rgbCurrentImage.length}B | templates=${rgbTemplates.length} (${rgbTemplates.map(b=>b.length).join(',')}B) | expertPhotos=${expertPayload?.length || 0} (${expertPayload?.map(b=>b.length).join(',') || '-'}B) refPhotoUploaded=${!!referencePhotoBuffer} | logo=${rgbLogo ? rgbLogo.length+'B' : 'NONE'} | brandKit=${brandKit ? 'YES' : 'NO'} | instruction_length=${finalInstruction.length} | prompt_length=${prompt.length}`);
    const result = await generateWithRotation(
      project.org_id,
      {
        templates: templatesPayload,
        expertPhotos: expertPayload,
        logo: rgbLogo,
        prompt,
        aspectRatio: getAspectRatio(project.width ?? 1080, project.height ?? 1350),
      },
      preferredModel,
      { requireImageInput: true }
    );
    console.log(`[edit-one] OK creative=${creativeId.slice(0,8)} | provider=${result.provider} model=${result.model} fallback=${result.fallbackUsed} image=${result.image.length}B`);

    await supabase.storage.from("creatives").upload(creative.file_path, result.image, {
      contentType: result.mimeType,
      upsert: true,
    });

    const { data: signedUrlData } = await supabase.storage
      .from("creatives")
      .createSignedUrl(creative.file_path, 3600);

    await supabase
      .from("criativos_creatives")
      .update({
        status: originalStatus === "approved" ? "approved" : "completed",
        file_path: creative.file_path,
        prompt_used: prompt,
        provider_used: result.provider,
        model_used: result.model,
        error_message: null,
      })
      .eq("id", creativeId);

    return NextResponse.json({
      success: true,
      creativeId,
      url: signedUrlData?.signedUrl ?? null,
      provider: result.provider,
      model: result.model,
      fallbackUsed: result.fallbackUsed || false,
    });
  } catch (err) {
    if (creativeId) {
      try {
        const supabase = await createServiceSupabase();
        await supabase
          .from("criativos_creatives")
          .update({
            status: originalStatus === "approved" ? "approved" : "completed",
            error_message: err instanceof Error ? err.message : "Erro ao editar imagem",
          })
          .eq("id", creativeId);
      } catch {
        // ignore cleanup failure
      }
    }

    if (err instanceof Error && (err.message.includes("auth") || err.message.includes("token"))) {
      return handleAuthError(err);
    }

    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erro ao editar criativo" },
      { status: 500 }
    );
  }
}

