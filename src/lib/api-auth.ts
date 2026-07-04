import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Cria Supabase client com ANON KEY (respeita RLS).
 * Usar em rotas que precisam de contexto de usuário.
 */
export async function createAuthSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* Server Component */ }
        },
      },
    }
  );
}

/**
 * Cria Supabase client com SERVICE KEY.
 * Usar APENAS para operações que precisam bypassar RLS (ex: seed, admin).
 */
export async function createServiceSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* service role */ },
      },
    }
  );
}

interface AuthResult {
  user: { id: string; email?: string };
  orgId: string;
  supabase: Awaited<ReturnType<typeof createAuthSupabase>>;
}

/**
 * Verifica autenticação + membership na organização.
 * Retorna user, orgId e supabase client autenticado.
 * Lança erro se não autenticado ou não tem acesso.
 */
export async function requireAuth(orgId?: string | null): Promise<AuthResult> {
  const supabase = await createAuthSupabase();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) {
    throw new AuthError("Não autenticado", 401);
  }

  // Se orgId fornecido, verificar membership
  if (orgId) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .single();

    if (!membership) {
      throw new AuthError("Sem acesso a esta organização", 403);
    }

    return { user, orgId, supabase };
  }

  // Se orgId não fornecido, buscar org do usuário
  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    throw new AuthError("Usuário sem organização", 403);
  }

  return { user, orgId: membership.org_id, supabase };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function handleAuthError(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Erro interno";
  return NextResponse.json({ error: message }, { status: 500 });
}

/**
 * Filtra campos permitidos de um objeto (previne mass assignment).
 */
export function whitelist<T extends Record<string, unknown>>(
  body: T,
  allowedFields: string[]
): Partial<T> {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => allowedFields.includes(key))
  ) as Partial<T>;
}

/**
 * Valida que uma URL é pública (previne SSRF).
 */
export function isPublicUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    if (!["http:", "https:"].includes(url.protocol)) return false;

    const blocked = [
      "localhost", "127.0.0.1", "0.0.0.0", "::1",
      "10.", "172.16.", "172.17.", "172.18.", "172.19.",
      "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
      "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
      "172.30.", "172.31.", "192.168.", "169.254.",
    ];

    return !blocked.some(b => hostname === b || hostname.startsWith(b));
  } catch {
    return false;
  }
}

