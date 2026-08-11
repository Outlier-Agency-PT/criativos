import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, whitelist } from "@/lib/api-auth";

function buildRawText(fields: {
  headline?: unknown;
  mini_copy?: unknown;
  list_items?: unknown;
  cta?: unknown;
  body?: unknown;
  raw_text?: unknown;
}) {
  const providedRawText = typeof fields.raw_text === "string" ? fields.raw_text.trim() : "";
  if (providedRawText) return providedRawText;

  return [
    typeof fields.headline === "string" ? fields.headline.trim() : "",
    typeof fields.mini_copy === "string" ? fields.mini_copy.trim() : "",
    typeof fields.list_items === "string" ? fields.list_items.trim() : "",
    typeof fields.cta === "string" ? fields.cta.trim() : "",
    typeof fields.body === "string" ? fields.body.trim() : "",
  ]
    .filter(Boolean)
    .join("\n\n") || null;
}

function isMissingListItemsColumn(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("'list_items'") && error.message.includes("schema cache"));
}

/**
 * GET /api/copy-library?campaignId=Y&product=Z&search=Z&tags=a,b&page=1&limit=20&sort=created_at
 * Lista copies paginada com full-text search.
 * Swipe File é global — não filtra por org. A RLS garante apenas utilizadores autenticados.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const campaignId = sp.get("campaignId");
    const product = sp.get("product");
    const search = sp.get("search");
    const tagsParam = sp.get("tags");
    const page = parseInt(sp.get("page") || "1", 10);
    const limit = Math.min(parseInt(sp.get("limit") || "20", 10), 100);
    const sort = sp.get("sort") || "created_at";

    const { supabase } = await requireAuth();

    const offset = (page - 1) * limit;

    let query = supabase
      .from("copy_library")
      .select("*, copy_campaigns(name)", { count: "exact" })
      .range(offset, offset + limit - 1);

    // Filtro por campanha
    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    // Filtro por produto
    if (product) {
      query = query.eq("product", product);
    }

    // Filtro por tags (match any)
    if (tagsParam) {
      const tags = tagsParam.split(",").map((t) => t.trim());
      query = query.overlaps("tags", tags);
    }

    // Full-text search
    if (search) {
      query = query.textSearch("headline,mini_copy,cta,body", search, {
        type: "plain",
        config: "portuguese",
      });
    }

    // Ordenação
    const sortField = ["created_at", "times_used", "last_used_at"].includes(sort) ? sort : "created_at";
    query = query.order(sortField, { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      copies: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

const OUTLIER_ORG_ID = "6b9e8609-d092-4b60-bc34-b6943eb1ff05";

/**
 * POST /api/copy-library
 * Criar nova copy na biblioteca global.
 * org_id é sempre a Outlier Agency (FK obrigatória na tabela, mas não afeta visibilidade).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { supabase, user } = await requireAuth();

    const safeFields = whitelist(body, [
      "headline", "mini_copy", "list_items", "cta", "body", "raw_text",
      "campaign_id", "tags", "source", "product",
    ]);

    const rawText = buildRawText(safeFields);

    const payload = {
      ...safeFields,
      raw_text: rawText,
      org_id: OUTLIER_ORG_ID,
      created_by: user.id,
      source: safeFields.source || "manual",
    };

    let { data, error } = await supabase
      .from("copy_library")
      .insert(payload)
      .select()
      .single();

    if (isMissingListItemsColumn(error)) {
      const { raw_text, org_id, created_by, source, headline, mini_copy, cta, body, campaign_id, tags, product } = payload as any;
      const fallbackPayload = { raw_text, org_id, created_by, source, headline, mini_copy, cta, body, campaign_id, tags, product };
      const retry = await supabase
        .from("copy_library")
        .insert(fallbackPayload)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ copy: data }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}

