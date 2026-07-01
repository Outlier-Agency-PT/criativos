import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, whitelist } from "@/lib/api-auth";
import { createServiceSupabase } from "@/lib/api-auth";

async function withSignedUrl(photo: Record<string, unknown>) {
  const storage = await createServiceSupabase();
  const filePath = typeof photo.file_path === "string" ? photo.file_path : null;

  if (!filePath) {
    return { ...photo, url: null };
  }

  const { data } = await storage.storage
    .from("expert-photos")
    .createSignedUrl(filePath, 3600);

  return { ...photo, url: data?.signedUrl || null };
}

export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get("orgId");
    const { supabase } = await requireAuth(orgId);

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatÃ³rio" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("criativos_expert_photos")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Bucket Ã© privado; a UI precisa de signed URLs.
    const photosWithUrls = await Promise.all(
      (data || []).map((photo) => withSignedUrl(photo))
    );

    return NextResponse.json({ photos: photosWithUrls });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supabase } = await requireAuth(body.org_id);

    const safeInsert = whitelist(body, ["org_id", "file_path", "file_name", "mime_type", "width", "height", "is_active"]);

    const { data, error } = await supabase
      .from("criativos_expert_photos")
      .insert(safeInsert)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ photo: await withSignedUrl(data) }, { status: 201 });
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
      return NextResponse.json({ error: "id obrigatÃ³rio" }, { status: 400 });
    }

    const safeUpdates = whitelist(rest, ["is_active"]);

    const resolvedOrgId = orgId || org_id;
    const { data, error } = await supabase
      .from("criativos_expert_photos")
      .update(safeUpdates)
      .eq("id", id)
      .eq("org_id", resolvedOrgId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ photo: data });
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
      return NextResponse.json({ error: "id obrigatÃ³rio" }, { status: 400 });
    }

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatÃ³rio" }, { status: 400 });
    }

    const { error } = await supabase
      .from("criativos_expert_photos")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

