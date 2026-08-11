import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, checkSuperAdmin } from "@/lib/api-auth";

/**
 * POST /api/projects
 * Cria um generation_project no banco a partir dos dados do wizard.
 * Insere também project_templates, project_copies e project_photos.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      personaId,
      brandKitId,
      format,
      selectedFormats,
      showLogo,
      selectedTemplates,
      copies,
      selectedPhotos,
      chatHistory,
      useCustomBackground,
      backgroundMode,
      selectedBackgrounds,
      blockColors,
    } = body;

    const { user, orgId, supabase } = await requireAuth();

    if (!format?.width || !format?.height) {
      return NextResponse.json({ error: "format (width/height) obrigatório" }, { status: 400 });
    }

    if (!copies?.length) {
      return NextResponse.json({ error: "Pelo menos 1 copy é necessário" }, { status: 400 });
    }

    // Resolve client_user_id: super admins podem criar em nome de um cliente;
    // clientes só criam para si próprios.
    const isSuperAdmin = await checkSuperAdmin(supabase, orgId);
    const clientUserId: string | null = isSuperAdmin
      ? (typeof body.client_user_id === "string" && body.client_user_id.trim()
          ? body.client_user_id.trim()
          : user.id)
      : user.id;

    // 1. Criar projeto
    const { data: project, error: projError } = await supabase
      .from("criativos_generation_projects")
      .insert({
        org_id: orgId,
        client_user_id: clientUserId,
        persona_id: personaId || null,
        brand_kit_id: brandKitId || null,
        name: typeof name === "string" && name.trim()
          ? name.trim()
          : `Projeto ${new Date().toLocaleDateString("pt-BR")}`,
        format: format.label || `${format.width}x${format.height}`,
        width: format.width,
        height: format.height,
        selected_formats: Array.isArray(selectedFormats) && selectedFormats.length > 0
          ? selectedFormats
          : [{ width: format.width, height: format.height, label: format.label || `${format.width}x${format.height}` }],
        show_logo: showLogo ?? false,
        use_custom_background: useCustomBackground === true,
        background_mode: backgroundMode === "split-top" || backgroundMode === "split-bottom" ? backgroundMode : "full",
        block_colors: Array.isArray(blockColors) ? blockColors.filter((c) => typeof c === "string") : [],
        status: "complete",
        chat_history: chatHistory?.length ? chatHistory : null,
      })
      .select("id")
      .single();

    if (projError || !project) {
      return NextResponse.json(
        { error: `Erro ao criar projeto: ${projError?.message}` },
        { status: 500 }
      );
    }

    const projectId = project.id;

    // 2. Inserir templates selecionados
    if (selectedTemplates?.length) {
      const templateRows = selectedTemplates.map(
        (t: { id: string }, i: number) => ({
          project_id: projectId,
          template_id: t.id,
          sort_order: i,
        })
      );

      const { error: tmplError } = await supabase
        .from("criativos_project_templates")
        .insert(templateRows);

      if (tmplError) {
        // Cleanup: remover projeto criado
        await supabase
          .from("criativos_generation_projects")
          .delete()
          .eq("id", projectId);
        return NextResponse.json(
          { error: `Erro ao salvar templates: ${tmplError.message}` },
          { status: 500 }
        );
      }
    }

    // 3. Inserir copies
    const copyRows = copies.map(
      (c: { id?: string; content: Record<string, string>; source: string }, i: number) => ({
        id: c.id,
        project_id: projectId,
        content: c.content,
        source: c.source || "manual",
        sort_order: i,
      })
    );

    const { error: copyError } = await supabase
      .from("criativos_project_copies")
      .insert(copyRows);

    if (copyError) {
      await supabase
        .from("criativos_generation_projects")
        .delete()
        .eq("id", projectId);
      return NextResponse.json(
        { error: `Erro ao salvar copies: ${copyError.message}` },
        { status: 500 }
      );
    }

    // 4. Inserir fotos selecionadas (dedupe por photo_id)
    if (selectedPhotos?.length) {
      const seen = new Set<string>();
      const uniquePhotos = (selectedPhotos as Array<{ id: string }>).filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      const photoRows = uniquePhotos.map(
        (p, i) => ({
          project_id: projectId,
          photo_id: p.id,
          sort_order: i,
        })
      );

      const { error: photoError } = await supabase
        .from("criativos_project_photos")
        .insert(photoRows);

      if (photoError) {
        await supabase
          .from("criativos_generation_projects")
          .delete()
          .eq("id", projectId);
        return NextResponse.json(
          { error: `Erro ao salvar fotos: ${photoError.message}` },
          { status: 500 }
        );
      }
    }

    // 5. Inserir fundos próprios (dedupe por file_path)
    if (Array.isArray(selectedBackgrounds) && selectedBackgrounds.length > 0) {
      const seenBg = new Set<string>();
      const backgroundRows: Array<{ project_id: string; file_path: string; file_name: string | null; sort_order: number }> = [];
      for (const raw of selectedBackgrounds as Array<{ filePath?: string; label?: string }>) {
        const filePath = typeof raw?.filePath === "string" ? raw.filePath : "";
        if (!filePath || seenBg.has(filePath)) continue;
        seenBg.add(filePath);
        backgroundRows.push({
          project_id: projectId,
          file_path: filePath,
          file_name: typeof raw?.label === "string" ? raw.label : null,
          sort_order: backgroundRows.length,
        });
      }
      if (backgroundRows.length > 0) {
        await supabase.from("criativos_project_backgrounds").insert(backgroundRows);
      }
    }

    return NextResponse.json({ projectId }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}

