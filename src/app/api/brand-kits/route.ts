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
      .from("criativos_brand_kits")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Resolve a URL assinada do logo de cada brand kit DIRETO do storage.
    // Antes, os consumidores tentavam casar logo_path com a tabela criativos_logos
    // (que pode estar vazia) e davam "logo sem ficheiro" mesmo o ficheiro existindo.
    // O logo do brand kit fica no bucket "logos" (fallback legado "brand-assets").
    const kits = data ?? [];
    const logoPaths = [
      ...new Set(
        kits
          .map((k) => k.logo_path)
          .filter((p): p is string => Boolean(p))
      ),
    ];

    // 1 round-trip no bucket primário "logos" pra todos os logos.
    const urlByPath = new Map<string, string>();
    if (logoPaths.length > 0) {
      const { data: signedList } = await supabase.storage
        .from("logos")
        .createSignedUrls(logoPaths, 3600);
      for (const s of signedList || []) {
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
      }
      // Fallback legado "brand-assets" só pros que não resolveram no primário.
      const missing = logoPaths.filter((p) => !urlByPath.has(p));
      if (missing.length > 0) {
        const { data: legacyList } = await supabase.storage
          .from("brand-assets")
          .createSignedUrls(missing, 3600);
        for (const s of legacyList || []) {
          if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
        }
      }
    }

    const brandKits = kits.map((kit) => ({
      ...kit,
      logo_url: kit.logo_path ? urlByPath.get(kit.logo_path) ?? null : null,
    }));

    return NextResponse.json({ brandKits });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supabase } = await requireAuth(body.org_id);

    const safeInsert = whitelist(body, [
      "org_id", "name", "colors", "fonts", "logo_path",
      "source_url", "is_default", "extra_styles",
    ]);

    const { data, error } = await supabase
      .from("criativos_brand_kits")
      .insert(safeInsert)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ brandKit: data }, { status: 201 });
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
      "name", "colors", "fonts", "logo_path", "source_url", "is_default", "extra_styles",
    ]);

    const resolvedOrgId = orgId || org_id;
    const { data, error } = await supabase
      .from("criativos_brand_kits")
      .update(safeUpdates)
      .eq("id", id)
      .eq("org_id", resolvedOrgId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ brandKit: data });
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
      .from("criativos_brand_kits")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

