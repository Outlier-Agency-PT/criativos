import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

/**
 * GET /api/projects/[projectId]/config
 * Retorna configuracao completa de um projeto: dados base + templates + copies + photos.
 * Usado pelo "Gerar Novamente" para preencher o wizard.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { orgId, supabase } = await requireAuth();

    // 1. Buscar projeto principal
    let project:
      | {
          id: string;
          org_id: string;
          name: string | null;
          persona_id: string | null;
          brand_kit_id: string | null;
          format: string | null;
          width: number | null;
          height: number | null;
          show_logo: boolean | null;
          chat_history: unknown;
          status: string | null;
          current_step?: number | null;
          preferred_model?: string | null;
          expert_adjustments?: { presets?: string[]; notes?: string } | null;
          selected_formats?: Array<{ width: number; height: number; label?: string }> | null;
          copy_pattern?: string | null;
          active_copy_fields?: string[] | null;
          background_mode?: string | null;
          block_colors?: string[] | null;
          use_custom_background?: boolean | null;
          variation_enabled?: boolean | null;
          vary_clothing?: boolean | null;
        }
      | null = null;
    let projError: { message: string } | null = null;

    // NOTA: variation_enabled (migration 20260618140000) e vary_clothing (migration
    // 20260621000002) são colunas recentes. Se alguma ainda não existir no banco, o
    // select com a coluna falha; por isso há fallback sem elas.
    const SELECT_WITH_VARIATION =
      "id, org_id, name, persona_id, brand_kit_id, format, width, height, show_logo, chat_history, status, expert_adjustments, selected_formats, copy_pattern, active_copy_fields, background_mode, block_colors, use_custom_background, variation_enabled, vary_clothing";
    const SELECT_WITHOUT_VARIATION =
      "id, org_id, name, persona_id, brand_kit_id, format, width, height, show_logo, chat_history, status, expert_adjustments, selected_formats, copy_pattern, active_copy_fields, background_mode, block_colors, use_custom_background";

    const projectWithStep = await supabase
      .from("criativos_generation_projects")
      .select(SELECT_WITH_VARIATION)
      .eq("id", projectId)
      .eq("org_id", orgId)
      .single();

    if (projectWithStep.error) {
      const projectWithoutStep = await supabase
        .from("criativos_generation_projects")
        .select(SELECT_WITHOUT_VARIATION)
        .eq("id", projectId)
        .eq("org_id", orgId)
        .single();

      project = projectWithoutStep.data;
      projError = projectWithoutStep.error;
    } else {
      project = projectWithStep.data;
      projError = projectWithStep.error;
    }

    if (projError || !project) {
      return NextResponse.json(
        { error: "Projeto nao encontrado" },
        { status: 404 }
      );
    }

    // 2. Buscar dados associados em paralelo
    const projectTemplatesPromise = supabase
      .from("criativos_project_templates")
      .select("template_id, sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });
    const copiesPromise = supabase
      .from("criativos_project_copies")
      .select("id, content, source, sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });
    const projectPhotosPromise = supabase
      .from("criativos_project_photos")
      .select("photo_id, sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });
    const projectBackgroundsPromise = supabase
      .from("criativos_project_backgrounds")
      .select("file_path, file_name, sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });
    const creativeRowsPromise = supabase
      .from("criativos_creatives")
      .select("id, status, file_path, error_message")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    const [
      { data: projectTemplates },
      { data: copies },
      { data: projectPhotos },
      { data: projectBackgrounds },
      { data: creativeRows },
      personaResult,
      brandKitResult,
    ] = await Promise.all([
      projectTemplatesPromise,
      copiesPromise,
      projectPhotosPromise,
      projectBackgroundsPromise,
      creativeRowsPromise,
      project.persona_id
        ? supabase
            .from("criativos_personas")
            .select("name")
            .eq("id", project.persona_id)
            .single()
        : Promise.resolve({ data: null }),
      project.brand_kit_id
        ? supabase
            .from("criativos_brand_kits")
            .select("name")
            .eq("id", project.brand_kit_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    // 3. Buscar dados dos templates (nome, categoria, etc)
    let templates: Array<{
      id: string;
      name: string;
      category: string;
      file_path: string | null;
      thumbnail_path: string | null;
      copy_elements: unknown;
      mini_prompt: string | null;
    }> = [];

    if (projectTemplates?.length) {
      const templateIds = projectTemplates.map((pt) => pt.template_id);
      const { data: templateRows } = await supabase
        .from("criativos_templates")
        .select("id, name, category, file_path, thumbnail_path, copy_elements, mini_prompt")
        .in("id", templateIds);

      if (templateRows) {
        // Manter ordem do sort_order
        templates = templateIds
          .map((tid) => templateRows.find((t) => t.id === tid))
          .filter(Boolean) as typeof templates;
      }
    }

    // PERF: signed URLs dos templates em UMA chamada (createSignedUrls plural).
    const templateUrls = new Map<string, string | null>();
    const templatePathByTemplate = new Map<string, string>();
    for (const t of templates) {
      const assetPath = t.file_path || t.thumbnail_path;
      if (assetPath) templatePathByTemplate.set(t.id, assetPath);
      else templateUrls.set(t.id, null);
    }
    const templatePaths = [...new Set(templatePathByTemplate.values())];
    if (templatePaths.length > 0) {
      const { data: signedList } = await supabase.storage
        .from("templates")
        .createSignedUrls(templatePaths, 3600);
      const pathToUrl = new Map<string, string>();
      for (const s of signedList ?? []) {
        if (s.path && s.signedUrl) pathToUrl.set(s.path, s.signedUrl);
      }
      for (const [tid, path] of templatePathByTemplate) {
        templateUrls.set(tid, pathToUrl.get(path) ?? null);
      }
    }

    let photos: Array<{
      id: string;
      url: string;
      label: string;
    }> = [];

    if (projectPhotos?.length) {
      const photoIds = projectPhotos.map((pp) => pp.photo_id);
      const { data: photoRows } = await supabase
        .from("criativos_expert_photos")
        .select("id, file_path, file_name")
        .in("id", photoIds);

      if (photoRows) {
        // PERF: signed URLs das fotos em UMA chamada (createSignedUrls plural).
        const orderedPhotos = photoIds
          .map((pid) => photoRows.find((p) => p.id === pid))
          .filter((p): p is NonNullable<typeof p> => Boolean(p));
        const photoPaths = orderedPhotos.map((p) => p.file_path).filter((p): p is string => !!p);
        const photoUrlMap = new Map<string, string>();
        if (photoPaths.length > 0) {
          const { data: signedList } = await supabase.storage
            .from("expert-photos")
            .createSignedUrls(photoPaths, 3600);
          for (const s of signedList ?? []) {
            if (s.path && s.signedUrl) photoUrlMap.set(s.path, s.signedUrl);
          }
        }
        photos = orderedPhotos.map((p) => ({
          id: p.id,
          url: p.file_path ? (photoUrlMap.get(p.file_path) ?? "") : "",
          label: p.file_name || "",
        }));
      }
    }

    // Fundos próprios (criativos_project_backgrounds). Mesmo bucket/padrão das fotos
    // do expert ("expert-photos"). Só carrega quando o projeto usa fundo próprio —
    // espelha exatamente o tratamento das fotos (signed URLs em lote).
    let backgrounds: Array<{
      id: string;
      filePath: string;
      url: string;
      label: string;
    }> = [];

    if (project.use_custom_background === true && projectBackgrounds?.length) {
      const bgPaths = projectBackgrounds
        .map((b) => b.file_path)
        .filter((p): p is string => !!p);
      const bgUrlMap = new Map<string, string>();
      if (bgPaths.length > 0) {
        const { data: signedList } = await supabase.storage
          .from("expert-photos")
          .createSignedUrls(bgPaths, 3600);
        for (const s of signedList ?? []) {
          if (s.path && s.signedUrl) bgUrlMap.set(s.path, s.signedUrl);
        }
      }
      backgrounds = projectBackgrounds
        .filter((b): b is { file_path: string; file_name: string | null; sort_order: number } => !!b.file_path)
        .map((b) => ({
          id: b.file_path,
          filePath: b.file_path,
          url: bgUrlMap.get(b.file_path) ?? "",
          label: b.file_name || "Fundo",
        }));
    }

    // PERF: gera todas as signed URLs dos criativos em UMA chamada (createSignedUrls
    // plural) em vez de uma por ficheiro. Antes: N chamadas × ~700ms. Agora: 1 chamada.
    const creativePaths = (creativeRows ?? [])
      .map((c) => c.file_path)
      .filter((p): p is string => !!p);
    const creativeUrlMap = new Map<string, string>();
    if (creativePaths.length > 0) {
      const { data: signedList } = await supabase.storage
        .from("creatives")
        .createSignedUrls(creativePaths, 3600);
      for (const s of signedList ?? []) {
        if (s.path && s.signedUrl) creativeUrlMap.set(s.path, s.signedUrl);
      }
    }
    const creatives = (creativeRows ?? []).map((c) => ({
      id: c.id,
      status: c.status,
      file_path: c.file_path,
      signed_url: c.file_path ? (creativeUrlMap.get(c.file_path) ?? null) : null,
      error_message: c.error_message,
    }));

    const personaName = personaResult.data?.name ?? null;
    const brandKitName = brandKitResult.data?.name ?? null;

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        personaId: project.persona_id,
        personaName,
        brandKitId: project.brand_kit_id,
        brandKitName,
        format: {
          width: project.width,
          height: project.height,
          label: project.format || `${project.width}x${project.height}`,
        },
        selectedFormats: Array.isArray(project.selected_formats) && project.selected_formats.length > 0
          ? project.selected_formats.map((f) => ({
              width: f.width,
              height: f.height,
              label: f.label || `${f.width}x${f.height}`,
            }))
          : [{
              width: project.width ?? 1080,
              height: project.height ?? 1350,
              label: project.format || `${project.width ?? 1080}x${project.height ?? 1350}`,
            }],
        showLogo: project.show_logo ?? false,
        chatHistory: project.chat_history ?? [],
        status: project.status ?? "draft",
        currentStep: 0,
        preferredModel: null,
        expertAdjustments: {
          presets: Array.isArray(project.expert_adjustments?.presets) ? project.expert_adjustments!.presets! : [],
          notes: typeof project.expert_adjustments?.notes === "string" ? project.expert_adjustments!.notes! : "",
        },
        copyPattern: project.copy_pattern === "mini_copy" ? "mini_copy" : "estatico",
        activeCopyFields: Array.isArray(project.active_copy_fields) ? project.active_copy_fields : null,
        backgroundMode: project.background_mode === "split-top" || project.background_mode === "split-bottom" ? project.background_mode : "full",
        blockColors: Array.isArray(project.block_colors)
          ? project.block_colors.filter((c): c is string => typeof c === "string")
          : [],
        useCustomBackground: project.use_custom_background === true,
        variationEnabled: project.variation_enabled === true,
        varyClothing: project.vary_clothing === true,
      },
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        thumbnailUrl: templateUrls.get(t.id) ?? null,
        copyElements: t.copy_elements,
        miniPrompt: t.mini_prompt,
      })),
      copies: (copies ?? []).map((c) => ({
        id: c.id,
        content: c.content,
        source: c.source || "manual",
      })),
      photos,
      backgrounds,
      creatives,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
