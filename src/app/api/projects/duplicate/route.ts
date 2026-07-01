import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

/**
 * POST /api/projects/duplicate
 * Duplica um projeto existente: copia config + templates + copies + photos.
 * NAO copia criativos gerados.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId obrigatorio" },
        { status: 400 }
      );
    }

    const { orgId, supabase } = await requireAuth();

    // 1. Buscar projeto original
    const { data: original, error: origError } = await supabase
      .from("criativos_generation_projects")
      .select(
        "org_id, name, persona_id, brand_kit_id, format, width, height, show_logo, chat_history, selected_formats, background_mode, block_colors"
      )
      .eq("id", projectId)
      .eq("org_id", orgId)
      .single();

    if (origError || !original) {
      return NextResponse.json(
        { error: "Projeto original nao encontrado" },
        { status: 404 }
      );
    }

    // 2. Criar novo projeto (copia)
    const { data: newProject, error: newProjError } = await supabase
      .from("criativos_generation_projects")
      .insert({
        org_id: orgId,
        name: `${original.name} (copia)`,
        persona_id: original.persona_id,
        brand_kit_id: original.brand_kit_id,
        format: original.format,
        width: original.width,
        height: original.height,
        selected_formats: original.selected_formats,
        show_logo: original.show_logo,
        chat_history: original.chat_history,
        background_mode: original.background_mode === "split-top" || original.background_mode === "split-bottom" ? original.background_mode : "full",
        block_colors: Array.isArray(original.block_colors) ? original.block_colors : [],
        status: "draft",
        total_creatives: 0,
      })
      .select("id")
      .single();

    if (newProjError || !newProject) {
      return NextResponse.json(
        { error: `Erro ao duplicar projeto: ${newProjError?.message}` },
        { status: 500 }
      );
    }

    const newProjectId = newProject.id;

    // 3. Copiar templates
    const { data: templates } = await supabase
      .from("criativos_project_templates")
      .select("template_id, sort_order")
      .eq("project_id", projectId);

    if (templates?.length) {
      const templateRows = templates.map((t) => ({
        project_id: newProjectId,
        template_id: t.template_id,
        sort_order: t.sort_order,
      }));

      await supabase.from("criativos_project_templates").insert(templateRows);
    }

    // 4. Copiar copies
    const { data: copies } = await supabase
      .from("criativos_project_copies")
      .select("content, source, sort_order")
      .eq("project_id", projectId);

    if (copies?.length) {
      const copyRows = copies.map((c) => ({
        project_id: newProjectId,
        content: c.content,
        source: c.source,
        sort_order: c.sort_order,
      }));

      await supabase.from("criativos_project_copies").insert(copyRows);
    }

    // 5. Copiar photos
    const { data: photos } = await supabase
      .from("criativos_project_photos")
      .select("photo_id, sort_order")
      .eq("project_id", projectId);

    if (photos?.length) {
      // Dedupe: 1 entrada por photo_id (sort_order mantido do primeiro encontro)
      const seen = new Set<string>();
      const uniquePhotos = photos.filter((p) => {
        if (seen.has(p.photo_id)) return false;
        seen.add(p.photo_id);
        return true;
      });
      const photoRows = uniquePhotos.map((p, i) => ({
        project_id: newProjectId,
        photo_id: p.photo_id,
        sort_order: i,
      }));

      await supabase.from("criativos_project_photos").insert(photoRows);
    }

    return NextResponse.json(
      { projectId: newProjectId, name: `${original.name} (copia)` },
      { status: 201 }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}

