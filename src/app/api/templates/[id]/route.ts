import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, createServiceSupabase } from "@/lib/api-auth";
import { isSuperAdminOrg } from "../route";

/**
 * DELETE /api/templates/[id]
 * Remove template do storage e da tabela.
 * Templates de sistema (is_system) nunca podem ser excluídos. Templates globais
 * (is_global) só pelo Super Admin — espelha o guard de mutação global do POST/PATCH.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { orgId } = body;
    const { supabase, orgId: resolvedOrgId } = await requireAuth(orgId);

    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    const { data: template, error: fetchError } = await supabase
      .from("criativos_templates")
      .select("id, org_id, file_path, is_system, is_global")
      .eq("id", id)
      .single();

    if (fetchError || !template) {
      return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
    }

    if (template.is_system) {
      return NextResponse.json({ error: "Templates do sistema não podem ser excluídos" }, { status: 403 });
    }

    let writeClient = supabase;
    if (template.is_global) {
      const isAdmin = await isSuperAdminOrg(supabase, resolvedOrgId);
      if (!isAdmin) {
        return NextResponse.json({ error: "Apenas o Super Admin pode excluir templates globais" }, { status: 403 });
      }
      writeClient = await createServiceSupabase();
    } else if (template.org_id !== resolvedOrgId) {
      return NextResponse.json({ error: "Sem acesso a este template" }, { status: 403 });
    }

    if (template.file_path) {
      await writeClient.storage.from("templates").remove([template.file_path]);
    }

    const { error: deleteError } = await writeClient
      .from("criativos_templates")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
