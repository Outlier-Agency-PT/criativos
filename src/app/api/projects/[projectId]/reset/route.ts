import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

/**
 * POST /api/projects/[projectId]/reset
 * Apaga TODOS os criativos gerados do projeto (banco + storage) e reseta status
 * pra "incomplete". Preserva templates, copies, fotos, persona, brand kit e logo.
 *
 * SEGURANÇA (regra absoluta: nunca apagar criativo sem ordem explícita):
 * só executa a exclusão se o body trouxer { confirmDelete: true }. Sem isso,
 * recusa com 400 — assim nenhum fluxo apaga criativos por engano. O botão que
 * acionava isso foi REMOVIDO da tela de resultado (gerar agora só ACUMULA).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { orgId, supabase } = await requireAuth();

    const body = await request.json().catch(() => ({}));
    if (body?.confirmDelete !== true) {
      return NextResponse.json(
        { error: "Exclusão de criativos bloqueada. Esta rota exige confirmDelete:true explícito. Gerar criativos NÃO apaga os anteriores." },
        { status: 400 }
      );
    }

    // 1. Verificar ownership
    const { data: project, error: projError } = await supabase
      .from("criativos_generation_projects")
      .select("id, org_id")
      .eq("id", projectId)
      .eq("org_id", orgId)
      .single();

    if (projError || !project) {
      return NextResponse.json({ error: "Projeto nao encontrado" }, { status: 404 });
    }

    // 2. Buscar e deletar arquivos do storage
    const { data: creatives } = await supabase
      .from("criativos_creatives")
      .select("file_path")
      .eq("project_id", projectId);

    const filePaths = (creatives ?? [])
      .map((c) => c.file_path)
      .filter((fp): fp is string => !!fp);

    if (filePaths.length > 0) {
      await supabase.storage.from("creatives").remove(filePaths);
    }

    // 3. Deletar registros
    const { error: delError } = await supabase
      .from("criativos_creatives")
      .delete()
      .eq("project_id", projectId);

    if (delError) {
      return NextResponse.json(
        { error: `Erro ao limpar criativos: ${delError.message}` },
        { status: 500 }
      );
    }

    // 4. Resetar status do projeto
    await supabase
      .from("criativos_generation_projects")
      .update({ status: "incomplete", total_creatives: 0 })
      .eq("id", projectId);

    return NextResponse.json({
      success: true,
      deletedCount: filePaths.length,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
