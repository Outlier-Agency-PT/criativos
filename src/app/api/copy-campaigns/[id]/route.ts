import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, whitelist } from "@/lib/api-auth";

/**
 * PUT /api/copy-campaigns/[id]
 * Editar campanha global.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { supabase } = await requireAuth();

    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    const safeUpdates = whitelist(body, ["name", "product", "description"]);

    const { data, error } = await supabase
      .from("copy_campaigns")
      .update(safeUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ campaign: data });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * DELETE /api/copy-campaigns/[id]
 * Deletar campanha global (só se sem copies associadas).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase } = await requireAuth();

    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    // Verificar se tem copies associadas
    const { count } = await supabase
      .from("copy_library")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id);

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Campanha possui ${count} copies. Remova ou mova as copies antes de deletar.` },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("copy_campaigns")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
