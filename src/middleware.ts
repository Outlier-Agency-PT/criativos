import { updateSession } from "@/lib/supabase-middleware";
import { NextResponse, type NextRequest } from "next/server";

// /convite e publica para que a checagem de org do middleware NAO crie uma org orfa antes de a
// membership do convidado ser estabelecida pelo fluxo de aceite (EP-14.10). O usuario ja esta
// autenticado nesse ponto (magic link trocado em /auth/callback); so falta a membership.
const PUBLIC_ROUTES = ["/login", "/registro", "/auth/callback", "/convite"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas pÃºblicas nÃ£o precisam de auth
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    const { supabaseResponse } = await updateSession(request);
    return supabaseResponse;
  }

  const { user, supabaseResponse, supabase } = await updateSession(request);

  // Se nÃ£o autenticado, redireciona para login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // PERF: a verificaÃ§Ã£o de org/setup abaixo faz uma query ao banco (~300ms).
  // Ela sÃ³ importa em NAVEGAÃ‡ÃƒO DE PÃGINA. As rotas de API (/api/*) jÃ¡ validam
  // auth + org internamente (requireAuth), entÃ£o pulamos a query nelas â€” isso
  // tirava ~300ms de CADA chamada de API (e o app faz muitas).
  //
  // CACHE: quando o setup jÃ¡ estÃ¡ completo, gravamos um cookie por sessÃ£o.
  // Nas navegaÃ§Ãµes seguintes, vemos o cookie e PULAMOS a query inteira â€” isso
  // remove os ~300ms de cada clique de "Criar"/navegaÃ§Ã£o depois do 1Âº acesso.
  const setupDoneCookie = request.cookies.get("criativos_setup_done")?.value === "1";
  if (
    !setupDoneCookie &&
    !pathname.startsWith("/setup") &&
    !pathname.startsWith("/api")
  ) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("org_id, organizations(setup_completed)")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    // Se nÃ£o tem organizaÃ§Ã£o, cria automaticamente
    if (!membership) {
      const { data: org } = await supabase
        .from("organizations")
        .insert({
          name: user.user_metadata?.full_name || "Minha OrganizaÃ§Ã£o",
          owner_id: user.id,
        })
        .select()
        .single();

      if (org) {
        await supabase.from("organization_members").insert({
          org_id: org.id,
          user_id: user.id,
          role: "owner",
        });
      }

      // Redireciona para setup
      const url = request.nextUrl.clone();
      url.pathname = "/setup";
      return NextResponse.redirect(url);
    }

    // Se setup nÃ£o completo, redireciona
    const org = membership.organizations as unknown as { setup_completed: boolean } | null;
    if (org && !org.setup_completed) {
      const url = request.nextUrl.clone();
      url.pathname = "/setup";
      return NextResponse.redirect(url);
    }

    // Setup completo: grava cookie pra pular a query nas prÃ³ximas navegaÃ§Ãµes.
    // Expira em 1h (se o setup for revertido, a query volta a rodar depois disso).
    if (org?.setup_completed) {
      supabaseResponse.cookies.set("criativos_setup_done", "1", {
        maxAge: 3600,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$).*)",
  ],
};
