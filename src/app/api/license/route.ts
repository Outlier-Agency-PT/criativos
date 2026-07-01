import { NextRequest, NextResponse } from "next/server";
import { createAuthSupabase, AuthError, handleAuthError } from "@/lib/api-auth";

// VersÃ£o vigente do Termo de LicenÃ§a e Confidencialidade.
const LICENSE_VERSION = "v1";

/**
 * GET /api/license
 * Retorna { accepted: boolean } indicando se o usuÃ¡rio logado jÃ¡ aceitou
 * a versÃ£o vigente da licenÃ§a. NÃ£o exige organizaÃ§Ã£o (o aceite Ã© por usuÃ¡rio).
 */
export async function GET() {
  try {
    const supabase = await createAuthSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) {
      throw new AuthError("NÃ£o autenticado", 401);
    }

    const { data, error } = await supabase
      .from("license_acceptances")
      .select("id")
      .eq("user_id", user.id)
      .eq("license_version", LICENSE_VERSION)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ accepted: Boolean(data) });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * POST /api/license
 * Registra o aceite da licenÃ§a vigente para o usuÃ¡rio logado.
 * Idempotente: ON CONFLICT (user_id, license_version) DO NOTHING.
 * Retorna { ok: true }.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createAuthSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) {
      throw new AuthError("NÃ£o autenticado", 401);
    }

    const userAgent = request.headers.get("user-agent");

    const { error } = await supabase
      .from("license_acceptances")
      .upsert(
        {
          user_id: user.id,
          license_version: LICENSE_VERSION,
          user_agent: userAgent,
        },
        { onConflict: "user_id,license_version", ignoreDuplicates: true }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

