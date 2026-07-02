import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, handleAuthError, createServiceSupabase } from "@/lib/api-auth";

/**
 * /api/admin/invite (EP-14.10)
 *
 * Fluxo de onboarding B2B: o admin convida um cliente por email; o cliente NOVO aceita o magic link,
 * define a propria senha e e vinculado a uma org JA EXISTENTE (provisionada pelo admin), sem criar
 * org nova. Substitui o self-signup aberto de registro/page.tsx.
 *
 * DECISAO DE AUTORIZACAO (espelha /api/billing/recharge da EP-14.06):
 *   O caso de uso real e "o admin Torriani convida o cliente de uma org que ele ja provisionou".
 *     - Convidar para a PROPRIA org: exige que o ator seja owner/admin (organization_members.role).
 *     - Convidar para uma org DIFERENTE (org de cliente): exige que a org do ATOR seja
 *       is_super_admin = true (fonte canonica criativos_org_limits.is_super_admin, EP-14.01).
 *       Um owner/admin comum NUNCA convida para org alheia.
 *   Qualquer tentativa fora dessas faixas recebe 403.
 *
 * REGRA INVIOLAVEL DO PROJETO:
 *   O convite cria usuario NOVO via auth.admin.inviteUserByEmail (magic link; o cliente define a
 *   propria senha). JAMAIS resetamos a senha de uma conta existente. A admin API roda SO server-side
 *   com a service key, nunca exposta ao client (research finding 5).
 *
 * SERVER-SIDE: o cliente admin de auth (createClient com service key) e instanciado dentro do handler
 *   e nunca cruza pro browser.
 *
 * Metodos:
 *   POST  -> cria o convite (invite + linha pending + provisionamento de plano/saldo)
 *   GET   -> lista convites (pendentes por padrao; ?status=accepted|expired|all altera o filtro)
 *   PATCH -> reenvia (action=resend) ou marca expirado (action=expire) um convite existente
 */

// Cria um client de auth admin com a service key, sem cookies (a admin API e stateless).
function createAdminAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Roles validos para um convite. owner so e atribuido em casos especiais; default editor.
const VALID_ROLES = ["owner", "admin", "editor"];

// Pacotes de credito iniciais aceitos no provisionamento (FR-016). Sem enum rigido alem disso:
// o admin pode passar credit_balance livre, mas estes sao os pacotes nominais do produto.
const CREDIT_PACKAGES = [50, 500, 1000];

// Validade padrao do convite em dias.
const INVITE_TTL_DAYS = 7;

/**
 * Resolve a org do ator e autoriza a acao sobre a org alvo.
 * Retorna { ok: true } ou um NextResponse de erro pronto.
 */
async function authorizeActorForOrg(
  supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"],
  userId: string,
  actorOrgId: string,
  targetOrgId: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const isOwnOrg = targetOrgId === actorOrgId;

  if (isOwnOrg) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", userId)
      .eq("org_id", actorOrgId)
      .maybeSingle();
    const role = membership?.role ?? "member";
    if (role !== "owner" && role !== "admin") {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Apenas admin/owner pode convidar para a organizacao." },
          { status: 403 }
        ),
      };
    }
    return { ok: true };
  }

  // Org alheia (org de cliente): exige Super Admin na org do ator.
  const { data: actorLimits } = await supabase
    .from("criativos_org_limits")
    .select("is_super_admin")
    .eq("org_id", actorOrgId)
    .maybeSingle();
  if (actorLimits?.is_super_admin !== true) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Apenas Super Admin pode convidar para outra organizacao." },
        { status: 403 }
      ),
    };
  }
  return { ok: true };
}

export async function POST(request: NextRequest) {
  try {
    const { user, orgId: actorOrgId, supabase } = await requireAuth();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body invalido." }, { status: 400 });
    }

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    // Validação mais rigorosa de email (RFC 5322 simplificado)
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      console.error("[admin/invite POST] Invalid email:", { email, bodyEmail: body.email });
      return NextResponse.json({ error: "Email inválido." }, { status: 400 });
    }

    const targetOrgId =
      typeof body.org_id === "string" ? body.org_id.trim() : "";
    if (!targetOrgId) {
      return NextResponse.json({ error: "org_id obrigatorio." }, { status: 400 });
    }

    // Role do convite. owner/admin/editor; default editor.
    let role = "editor";
    if (body.role !== undefined && body.role !== null) {
      if (typeof body.role !== "string" || !VALID_ROLES.includes(body.role)) {
        return NextResponse.json(
          { error: "role invalido (owner, admin ou editor)." },
          { status: 400 }
        );
      }
      role = body.role;
    }

    // Provisionamento opcional de plano/saldo (FR-016).
    const planLabel =
      typeof body.plan_label === "string" && body.plan_label.trim() !== ""
        ? body.plan_label.trim()
        : null;

    let creditBalance: number | null = null;
    const hasCredit = body.credit_balance !== undefined && body.credit_balance !== null;
    if (hasCredit) {
      const n = Number(body.credit_balance);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json(
          { error: "credit_balance deve ser um inteiro maior ou igual a zero." },
          { status: 400 }
        );
      }
      creditBalance = n;
    }

    // Guard de autorizacao (espelha recharge).
    const authz = await authorizeActorForOrg(
      supabase,
      user.id,
      actorOrgId,
      targetOrgId
    );
    if (!authz.ok) return authz.response;

    // A org alvo precisa existir (o admin ja a provisionou). Nao criamos org aqui.
    const service = await createServiceSupabase();
    const { data: targetOrg } = await service
      .from("organizations")
      .select("id")
      .eq("id", targetOrgId)
      .maybeSingle();
    if (!targetOrg) {
      return NextResponse.json(
        { error: "Organizacao alvo nao encontrada." },
        { status: 404 }
      );
    }

    // 1) Dispara o convite por email (cria usuario NOVO; magic link define a senha).
    //    org_id e role viajam no metadata; o aceite le dali pra vincular sem criar org nova.
    const adminAuth = createAdminAuthClient();
    const origin = new URL(request.url).origin;
    const { error: inviteError } = await adminAuth.auth.admin.inviteUserByEmail(
      email,
      {
        data: { org_id: targetOrgId, role, invited: true },
        redirectTo: `${origin}/auth/callback?next=/convite`,
      }
    );

    if (inviteError) {
      // Email já existe como usuário: inviteUserByEmail falha de propósito (não reenviamos magic link
      // pra conta existente, pra não tocar/expor a credencial dela). Sinalizamos sem vazar detalhe.
      console.error("[admin/invite POST] inviteUserByEmail error:", {
        email,
        error: inviteError.message,
        code: (inviteError as any).code,
      });
      return NextResponse.json(
        {
          error:
            "Não foi possível convidar este email. Verifique se já existe uma conta com ele.",
          detail: inviteError.message,
        },
        { status: 409 }
      );
    }

    // 2) Grava a linha pending em criativos_invites (fonte de verdade operacional do convite).
    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: invite, error: insertError } = await service
      .from("criativos_invites")
      .insert({
        email,
        org_id: targetOrgId,
        role,
        status: "pending",
        invited_by: user.id,
        expires_at: expiresAt,
      })
      .select("id, email, org_id, role, status, expires_at, created_at")
      .single();

    if (insertError || !invite) {
      const errorMsg = insertError?.message || "Nenhuma linha retornada após insert";
      console.error("[admin/invite POST] Insert error:", {
        email,
        org_id: targetOrgId,
        error: errorMsg,
        code: insertError?.code,
      });
      return NextResponse.json(
        {
          error: "Convite enviado, mas falha ao registrar.",
          detail: errorMsg,
        },
        { status: 500 }
      );
    }

    // 3) Provisionamento (FR-016): grava/atualiza plan_label e credit_balance da org cliente.
    //    A org cliente NUNCA recebe is_super_admin = true (forcamos false no upsert).
    let provisioned = false;
    if (planLabel !== null || creditBalance !== null) {
      const isPackage = creditBalance === null || CREDIT_PACKAGES.includes(creditBalance);

      // Upsert da row de limites (a backfill ja materializa uma row por org, mas garantimos a presenca).
      const upsertPayload: Record<string, unknown> = {
        org_id: targetOrgId,
        is_super_admin: false,
        updated_at: new Date().toISOString(),
      };
      if (planLabel !== null) upsertPayload.plan_label = planLabel;
      if (creditBalance !== null) {
        upsertPayload.credit_balance = creditBalance;
        upsertPayload.credits_total = creditBalance;
      }

      const { error: provError } = await service
        .from("criativos_org_limits")
        .upsert(upsertPayload, { onConflict: "org_id" });

      if (provError) {
        console.error("[admin/invite POST] Provisioning error:", {
          org_id: targetOrgId,
          planLabel,
          creditBalance,
          error: provError.message,
          code: provError.code,
        });
        return NextResponse.json(
          {
            error: "Convite criado, mas falha no provisionamento de saldo/plano.",
            detail: provError.message,
          },
          { status: 500 }
        );
      }
      provisioned = true;

      // Auditabilidade: quando o saldo inicial nao bate um pacote nominal, sinalizamos no payload.
      if (creditBalance !== null && !isPackage && invite) {
        (invite as Record<string, unknown>).credit_note =
          "credit_balance fora dos pacotes nominais (50/500/1000)";
      }
    }

    return NextResponse.json({ invite, provisioned }, { status: 201 });
  } catch (err) {
    console.error("[admin/invite POST] Unexpected error:", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return handleAuthError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { user, orgId: actorOrgId, supabase } = await requireAuth();

    const url = new URL(request.url);
    // Org alvo: por padrao a do ator; Super Admin pode passar ?org_id= pra inspecionar org de cliente.
    const targetOrgId = url.searchParams.get("org_id")?.trim() || actorOrgId;
    const statusFilter = url.searchParams.get("status")?.trim() || "pending";

    const authz = await authorizeActorForOrg(
      supabase,
      user.id,
      actorOrgId,
      targetOrgId
    );
    if (!authz.ok) return authz.response;

    const service = await createServiceSupabase();
    let query = service
      .from("criativos_invites")
      .select("id, email, org_id, role, status, invited_by, expires_at, created_at")
      .eq("org_id", targetOrgId)
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ invites: data ?? [] });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, orgId: actorOrgId, supabase } = await requireAuth();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body invalido." }, { status: 400 });
    }

    const inviteId = typeof body.invite_id === "string" ? body.invite_id.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "";
    if (!inviteId || !["resend", "expire"].includes(action)) {
      return NextResponse.json(
        { error: "invite_id e action (resend ou expire) obrigatorios." },
        { status: 400 }
      );
    }

    const service = await createServiceSupabase();
    const { data: invite } = await service
      .from("criativos_invites")
      .select("id, email, org_id, role, status")
      .eq("id", inviteId)
      .maybeSingle();

    if (!invite) {
      return NextResponse.json({ error: "Convite nao encontrado." }, { status: 404 });
    }

    // Autoriza sobre a org do convite.
    const authz = await authorizeActorForOrg(
      supabase,
      user.id,
      actorOrgId,
      invite.org_id
    );
    if (!authz.ok) return authz.response;

    if (action === "expire") {
      const { error } = await service
        .from("criativos_invites")
        .update({ status: "expired" })
        .eq("id", inviteId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, status: "expired" });
    }

    // resend: so faz sentido para convite ainda pending.
    if (invite.status !== "pending") {
      return NextResponse.json(
        { error: "So e possivel reenviar convite pendente." },
        { status: 409 }
      );
    }

    const adminAuth = createAdminAuthClient();
    const origin = new URL(request.url).origin;
    const { error: inviteError } = await adminAuth.auth.admin.inviteUserByEmail(
      invite.email,
      {
        data: { org_id: invite.org_id, role: invite.role, invited: true },
        redirectTo: `${origin}/auth/callback?next=/convite`,
      }
    );
    if (inviteError) {
      return NextResponse.json(
        { error: "Falha ao reenviar o convite.", detail: inviteError.message },
        { status: 409 }
      );
    }

    // Renova a validade ao reenviar.
    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    await service
      .from("criativos_invites")
      .update({ expires_at: expiresAt })
      .eq("id", inviteId);

    return NextResponse.json({ ok: true, status: "resent" });
  } catch (err) {
    return handleAuthError(err);
  }
}

