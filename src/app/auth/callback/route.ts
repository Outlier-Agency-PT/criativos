import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Callback de troca de token de auth (magic link, convite, recovery, etc).
 *
 * O Supabase pode entregar o token de duas formas dependendo do fluxo/template:
 *   1) `code` (PKCE) — trocado via exchangeCodeForSession;
 *   2) `token_hash` + `type` (OTP de email: invite, magiclink, recovery, email_change) —
 *      trocado via verifyOtp. O convite B2B (inviteUserByEmail) cai neste segundo caso,
 *      por isso o handler antigo (so' code) redirecionava sempre para /login.
 *
 * Quando `type === "invite"`, o destino e' sempre /convite (para o convidado definir a
 * password e ser vinculado a' organizacao), independente do `next` recebido.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";
  const destination = type === "invite" ? "/convite" : next;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

