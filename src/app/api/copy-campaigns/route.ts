import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, whitelist } from "@/lib/api-auth";

const OUTLIER_ORG_ID = "6b9e8609-d092-4b60-bc34-b6943eb1ff05";

/**
 * GET /api/copy-campaigns
 * Lista campanhas globais com count de copies.
 * Swipe File é global — não filtra por org. RLS garante utilizadores autenticados.
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireAuth();

    // Paginação: a biblioteca pode acumular muitas campanhas. Limita às 50 mais
    // recentes (ajustável via ?limit=). copies já vêm como count agregado.
    const limitParam = Number(request.nextUrl.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

    const { data, error } = await supabase
      .from("copy_campaigns")
      .select("*, copy_library(count)")
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
 * Criar nova campanha global (org_id = Outlier Agency).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { supabase } = await requireAuth();

    const safeFields = whitelist(body, ["name", "product", "description"]);

    if (!safeFields.name) {
      return NextResponse.json({ error: "name obrigatório" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("copy_campaigns")
      .insert({
        ...safeFields,
        org_id: OUTLIER_ORG_ID,
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

