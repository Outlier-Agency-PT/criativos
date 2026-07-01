import { NextResponse } from "next/server";
import { createAuthSupabase, createServiceSupabase, handleAuthError } from "@/lib/api-auth";

/**
 * POST /api/admin/invite/accept (EP-14.10)
 *
 * Aceite do convite B2B. O cliente NOVO ja exchangiou o magic link (auth/callback) e tem sessao.
 * Este handler:
 *   1) le o user autenticado e o metadata do convite (org_id, role) gravado pelo inviteUserByEmail;
 *   2) vincula o user em organization_members na org EXISTENTE do metadata (NUNCA cria org nova);
 *   3) marca o convite pending correspondente como accepted em criativos_invites.
 *
 * IMPORTANTE (sem org nova): o self-signup antigo criava org via create_organization_for_user.
 * Aqui NAO criamos org: o cliente entra numa org ja provisionada pelo admin. O org_id e autoritativo
 * do metadata do convite (gravado server-side pela admin API), nao do client.
 *
 * IMPORTANTE (precedencia sobre o middleware): o middleware cria org automaticamente para usuario
 * autenticado SEM membership. Por isso a rota /convite e publica no middleware (pula a checagem de
 * org) e o front chama este endpoint ANTES de qualquer navegacao protegida, garantindo a membership
 * antes que o middleware pudesse criar org orfa.
 */
export async function POST() {
  try {
    const supabase = await createAuthSupabase();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    // Metadata autoritativo do convite (gravado pela admin API, nunca pelo client).
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const orgId = typeof meta.org_id === "string" ? meta.org_id : "";
    const role =
      typeof meta.role === "string" && ["owner", "admin", "editor"].includes(meta.role)
        ? meta.role
        : "editor";

    if (!orgId) {
      return NextResponse.json(
        { error: "Convite sem organizacao no metadata. Solicite um novo convite." },
        { status: 400 }
      );
    }

    const service = await createServiceSupabase();

    // A org do convite precisa existir; NUNCA criamos org nova aqui.
    const { data: org } = await service
      .from("organizations")
      .select("id")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) {
      return NextResponse.json(
        { error: "Organizacao do convite nao existe mais." },
        { status: 404 }
      );
    }

    // Idempotencia: se ja e membro, nao duplica. Senao, insere com o role do convite.
    const { data: existing } = await service
      .from("organization_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (!existing) {
      const { error: memberError } = await service
        .from("organization_members")
        .insert({ org_id: orgId, user_id: user.id, role });
      if (memberError) {
        return NextResponse.json(
          { error: "Falha ao vincular a organizacao.", detail: memberError.message },
          { status: 500 }
        );
      }
    }

    // Marca o convite pending desta org/email como accepted (fonte de verdade operacional).
    const email = (user.email ?? "").toLowerCase();
    if (email) {
      await service
        .from("criativos_invites")
        .update({ status: "accepted" })
        .eq("org_id", orgId)
        .eq("email", email)
        .eq("status", "pending");
    }

    return NextResponse.json({ ok: true, org_id: orgId, role });
  } catch (err) {
    return handleAuthError(err);
  }
}

