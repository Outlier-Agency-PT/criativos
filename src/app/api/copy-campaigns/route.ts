import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, whitelist } from "@/lib/api-auth";

/**
 * GET /api/copy-campaigns?orgId=X
 * Lista campanhas com count de copies.
 */
export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get("orgId");
    const { supabase } = await requireAuth(orgId);

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatÃ³rio" }, { status: 400 });
    }

    // PaginaÃ§Ã£o: a biblioteca pode acumular muitas campanhas. Limita Ã s 50 mais
    // recentes (ajustÃ¡vel via ?limit=). copies jÃ¡ vÃªm como count agregado.
    const limitParam = Number(request.nextUrl.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

    const { data, error } = await supabase
      .from("copy_campaigns")
      .select("*, copy_library(count)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Formatar count
    const campaigns = (data || []).map((c) => ({
      ...c,
      copy_count: c.copy_library?.[0]?.count || 0,
      copy_library: undefined,
    }));

    return NextResponse.json({ campaigns });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * POST /api/copy-campaigns
 * Criar nova campanha.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { org_id, orgId } = body;
    const resolvedOrgId = org_id || orgId;

    const { supabase } = await requireAuth(resolvedOrgId);

    if (!resolvedOrgId) {
      return NextResponse.json({ error: "org_id obrigatÃ³rio" }, { status: 400 });
    }

    const safeFields = whitelist(body, ["name", "product", "description"]);

    if (!safeFields.name) {
      return NextResponse.json({ error: "name obrigatÃ³rio" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("copy_campaigns")
      .insert({
        ...safeFields,
        org_id: resolvedOrgId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}

