import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

/**
 * DELETE /api/logos/[id]
 * Remove logo do storage e da tabela.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { orgId: resolvedOrgId } = body;
    const { supabase } = await requireAuth(resolvedOrgId);

    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    // Buscar logo para obter file_path (filtrado por org)
    const { data: logo, error: fetchError } = await supabase
      .from("org_logos")
      .select("id, file_path")
      .eq("id", id)
      .eq("org_id", resolvedOrgId)
      .single();

    if (fetchError || !logo) {
      return NextResponse.json({ error: "Logo não encontrado" }, { status: 404 });
    }

    // Remover do storage
    await supabase.storage.from("logos").remove([logo.file_path]);

    // Remover da tabela
    const { error: deleteError } = await supabase
      .from("org_logos")
      .delete()
      .eq("id", id)
      .eq("org_id", resolvedOrgId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
