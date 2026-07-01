import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

/**
 * PATCH /api/copy-library/[id]/favorite
 * Toggle is_favorite.
 */
export async function PATCH(
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

    // Buscar estado atual (filtrado por org)
    const { data: current, error: fetchError } = await supabase
      .from("copy_library")
      .select("is_favorite")
      .eq("id", id)
      .eq("org_id", resolvedOrgId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: "Copy não encontrada" }, { status: 404 });
    }

    // Toggle
    const { data, error } = await supabase
      .from("copy_library")
      .update({ is_favorite: !current.is_favorite })
      .eq("id", id)
      .eq("org_id", resolvedOrgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ copy: data, is_favorite: data.is_favorite });
  } catch (err) {
    return handleAuthError(err);
  }
}
