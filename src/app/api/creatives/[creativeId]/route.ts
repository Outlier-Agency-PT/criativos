import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

/**
 * DELETE /api/creatives/[creativeId]
 * Exclui um criativo individual: arquivo no storage + registro no banco.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ creativeId: string }> }
) {
  try {
    const { creativeId } = await params;
    const { orgId, supabase } = await requireAuth();

    // 1. Buscar criativo e verificar que pertence a um projeto da org
    const { data: creative, error: fetchError } = await supabase
      .from("criativos_creatives")
      .select("id, file_path, project_id")
      .eq("id", creativeId)
      .single();

    if (fetchError || !creative) {
      return NextResponse.json(
        { error: "Criativo nao encontrado" },
        { status: 404 }
      );
    }

    // Verificar que o projeto pertence a org do usuario
    const { data: project } = await supabase
      .from("criativos_generation_projects")
      .select("id")
      .eq("id", creative.project_id)
      .eq("org_id", orgId)
      .single();

    if (!project) {
      return NextResponse.json(
        { error: "Sem permissao para excluir este criativo" },
        { status: 403 }
      );
    }

    // 2. Deletar arquivo do storage
    if (creative.file_path) {
      await supabase.storage
        .from("criativos_creatives")
        .remove([creative.file_path]);
    }

    // 3. Deletar registro do banco
    const { error: deleteError } = await supabase
      .from("criativos_creatives")
      .delete()
      .eq("id", creativeId);

    if (deleteError) {
      return NextResponse.json(
        { error: `Erro ao excluir criativo: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // 4. Atualizar total_creatives do projeto
    try {
      await supabase.rpc("decrement_total_creatives", {
        p_project_id: creative.project_id,
      });
    } catch {
      // Se a function nao existe, ignore o erro (fallback silencioso)
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
