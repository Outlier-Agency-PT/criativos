import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, whitelist } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get("orgId");
    const { supabase } = await requireAuth(orgId);

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatório" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("criativos_personas")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ personas: data });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supabase } = await requireAuth(body.org_id);

    const safeInsert = whitelist(body, [
      "org_id", "name", "target_audience", "audience_problems",
      "purchase_objections", "deep_desires", "extra_context",
      "generated_summary", "is_default",
    ]);

    const { data, error } = await supabase
      .from("criativos_personas")
      .insert(safeInsert)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ persona: data }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, orgId, org_id, ...rest } = body;
    const { supabase } = await requireAuth(orgId || org_id);

    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    const safeUpdates = whitelist(rest, [
      "name", "target_audience", "audience_problems", "purchase_objections",
      "deep_desires", "extra_context", "generated_summary", "is_default",
    ]);

    const resolvedOrgId = orgId || org_id;
    const { data, error } = await supabase
      .from("criativos_personas")
      .update(safeUpdates)
      .eq("id", id)
      .eq("org_id", resolvedOrgId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ persona: data });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    const orgId = request.nextUrl.searchParams.get("orgId");
    const { supabase } = await requireAuth(orgId);

    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatório" }, { status: 400 });
    }

    const { error } = await supabase
      .from("criativos_personas")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

