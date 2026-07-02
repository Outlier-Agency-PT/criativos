import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

/**
 * DELETE /api/projects/[projectId]
 * Exclui um projeto e todos os dados associados:
 * criativos (ficheiros + registros), copies, templates, photos.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { orgId, supabase } = await requireAuth();

    // 1. Verificar que o projeto pertence a esta org
    const { data: project, error: projError } = await supabase
      .from("criativos_generation_projects")
      .select("id, org_id")
      .eq("id", projectId)
      .eq("org_id", orgId)
      .single();

    if (projError || !project) {
      return NextResponse.json(
        { error: "Projeto nao encontrado" },
        { status: 404 }
      );
    }

    // 2. Buscar file_paths dos criativos para deletar do storage
    const { data: creatives } = await supabase
      .from("criativos_creatives")
      .select("file_path")
      .eq("project_id", projectId);

    // 3. Deletar ficheiros do storage bucket
    if (creatives?.length) {
      const filePaths = creatives
        .map((c) => c.file_path)
        .filter((fp): fp is string => !!fp);

      if (filePaths.length > 0) {
        await supabase.storage
          .from("creatives")
          .remove(filePaths);
      }
    }

    // 4. Deletar registros dependentes EM PARALELO (não dependem entre si).
    // Antes eram 4 queries sequenciais (~4x mais lento). Promise.all corta o tempo.
    await Promise.all([
      supabase.from("criativos_creatives").delete().eq("project_id", projectId),
      supabase.from("criativos_project_copies").delete().eq("project_id", projectId),
      supabase.from("criativos_project_templates").delete().eq("project_id", projectId),
      supabase.from("criativos_project_photos").delete().eq("project_id", projectId),
      supabase.from("criativos_project_backgrounds").delete().eq("project_id", projectId),
    ]);

    // 5. Deletar o projeto em si
    const { error: deleteError } = await supabase
      .from("criativos_generation_projects")
      .delete()
      .eq("id", projectId)
      .eq("org_id", orgId);

    if (deleteError) {
      return NextResponse.json(
        { error: `Erro ao eliminar projeto: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
