import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, whitelist } from "@/lib/api-auth";

function isMissingListItemsColumn(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("'list_items'") && error.message.includes("schema cache"));
}

/**
 * PUT /api/copy-library/[id]
 * Editar copy existente.
 */
export async function PUT(
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

    const safeUpdates = whitelist(body, [
      "headline", "mini_copy", "list_items", "cta", "body", "raw_text",
      "campaign_id", "tags", "is_favorite", "times_used", "last_used_at", "product",
    ]);

    let { data, error } = await supabase
      .from("copy_library")
      .update(safeUpdates)
      .eq("id", id)
      .eq("org_id", resolvedOrgId)
      .select()
      .single();

    if (isMissingListItemsColumn(error)) {
      const fallbackUpdates = { ...safeUpdates };
      delete fallbackUpdates.list_items;
      const retry = await supabase
        .from("copy_library")
        .update(fallbackUpdates)
        .eq("id", id)
        .eq("org_id", resolvedOrgId)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ copy: data });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * DELETE /api/copy-library/[id]
 * Deletar copy (hard delete).
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

    const { error } = await supabase
      .from("copy_library")
      .delete()
      .eq("id", id)
      .eq("org_id", resolvedOrgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
