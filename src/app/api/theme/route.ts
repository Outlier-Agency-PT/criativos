import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/theme?orgId=xxx
 * Retorna o tema ativo da org.
 */
export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get("orgId");
    const { supabase } = await requireAuth(orgId);

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatorio" }, { status: 400 });
    }

    const { data } = await supabase
      .from("org_theme_settings")
      .select("theme_id")
      .eq("org_id", orgId)
      .single();

    return NextResponse.json({ theme_id: data?.theme_id || "cyan" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/theme
 * Salva o tema da org (upsert).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orgId, themeId } = body;

    if (!orgId || !themeId) {
      return NextResponse.json({ error: "orgId e themeId obrigatorios" }, { status: 400 });
    }

    const validThemes = ["cyan", "torriani-blue", "classic-blue", "verde-premium"];
    if (!validThemes.includes(themeId)) {
      return NextResponse.json({ error: "Tema invalido" }, { status: 400 });
    }

    const { supabase } = await requireAuth(orgId);

    const { error } = await supabase
      .from("org_theme_settings")
      .upsert(
        { org_id: orgId, theme_id: themeId, updated_at: new Date().toISOString() },
        { onConflict: "org_id" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, theme_id: themeId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

