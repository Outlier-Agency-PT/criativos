import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, createServiceSupabase } from "@/lib/api-auth";

/**
 * POST /api/billing/recharge (EP-14.06)
 *
 * Endpoint administrativo (sem gateway de pagamento, CON-001) pra atribuir/recarregar o saldo de
 * credito de uma org, registrando o ajuste em criativos_credit_adjustments (auditabilidade FR-017).
 * A mutacao e autoritativa no backend via service key (NFR-002); o cliente nunca altera o proprio
 * saldo. A RLS endurecida da EP-14.02 garante que so o service role muta org_limits e adjustments.
 *
 * DECISAO DE AUTORIZACAO (quem pode recarregar qual org):
 *   O caso de uso real e "o admin Outlier Agency recarrega a org de um cliente que pagou". Por isso a regra
 *   e baseada em Super Admin, nao apenas em owner/admin da propria org:
 *     - Recarregar a PROPRIA org: exige que o ator seja owner/admin (organization_members.role) da org.
 *     - Recarregar uma org DIFERENTE (org de cliente): exige que a org do ATOR seja is_super_admin = true
 *       (fonte canonica criativos_org_limits.is_super_admin, EP-14.01). Um owner/admin comum NUNCA
 *       recarrega org alheia.
 *   Qualquer tentativa fora dessas duas faixas recebe 403. Isso impede que um cliente comum se
 *   autorrecarregue (so super admin recarrega, e a propria org so com role owner/admin).
 *
 * DECISAO DE ORG ILIMITADA (credit_balance IS NULL):
 *   Org ilimitada nao usa saldo decrementavel. Recarregar com delta nao faz sentido (somar a um saldo
 *   bypassado), entao delta numa org ilimitada retorna 400. set_to e permitido: tira a org do ilimitado
 *   e fixa um saldo finito (caso de uso: converter cliente ilimitado em pre-pago). Essa logica vive na
 *   RPC recharge_credit (status unlimited_no_delta).
 *
 * Body: { org_id: string (target), delta?: number, set_to?: number, reason?: string }
 *   - Exatamente um entre delta e set_to deve estar presente.
 *   - delta: incremento inteiro; pode ser negativo (correcao/estorno). Pacotes 50/500/1000 sao apenas
 *     valores validos de delta, sem enum rigido.
 *   - set_to: saldo absoluto inteiro >= 0.
 *
 * Resposta: { credit_balance, adjustment_id, credits_total }
 */
export async function POST(request: NextRequest) {
  try {
    // Autentica o ator e descobre a org dele (sem orgId => org do proprio usuario).
    const { user, orgId: actorOrgId, supabase } = await requireAuth();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body invalido." }, { status: 400 });
    }

    const targetOrgId = body.org_id;
    if (typeof targetOrgId !== "string" || targetOrgId.trim() === "") {
      return NextResponse.json({ error: "org_id obrigatorio." }, { status: 400 });
    }

    // Validacao do par delta/set_to: exatamente um presente, inteiro valido.
    const hasDelta = body.delta !== undefined && body.delta !== null;
    const hasSetTo = body.set_to !== undefined && body.set_to !== null;

    if (hasDelta === hasSetTo) {
      return NextResponse.json(
        { error: "Informe exatamente um entre delta e set_to." },
        { status: 400 }
      );
    }

    let delta: number | null = null;
    let setTo: number | null = null;

    if (hasDelta) {
      const n = Number(body.delta);
      if (!Number.isInteger(n) || n === 0) {
        return NextResponse.json(
          { error: "delta deve ser um inteiro diferente de zero (negativo permitido para correcao)." },
          { status: 400 }
        );
      }
      delta = n;
    } else {
      const n = Number(body.set_to);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json(
          { error: "set_to deve ser um inteiro maior ou igual a zero." },
          { status: 400 }
        );
      }
      setTo = n;
    }

    const reason =
      typeof body.reason === "string" && body.reason.trim() !== ""
        ? body.reason.trim()
        : null;

    // Guard de autorizacao.
    const isOwnOrg = targetOrgId === actorOrgId;

    if (isOwnOrg) {
      // Recarregar a propria org exige role owner/admin (mesmo padrao do PUT /api/org-limits).
      const { data: membership } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", actorOrgId)
        .maybeSingle();
      const role = membership?.role ?? "member";
      if (role !== "owner" && role !== "admin") {
        return NextResponse.json(
          { error: "Apenas admin/owner pode recarregar o saldo." },
          { status: 403 }
        );
      }
    } else {
      // Recarregar org alheia (org de cliente) exige que a org do ator seja Super Admin.
      const { data: actorLimits } = await supabase
        .from("criativos_org_limits")
        .select("is_super_admin")
        .eq("org_id", actorOrgId)
        .maybeSingle();
      if (actorLimits?.is_super_admin !== true) {
        return NextResponse.json(
          { error: "Apenas Super Admin pode recarregar o saldo de outra organizacao." },
          { status: 403 }
        );
      }
    }

    // Mutacao atomica via service key + RPC (saldo + ajuste na MESMA transacao).
    const service = await createServiceSupabase();
    const { data, error } = await service.rpc("recharge_credit", {
      p_org_id: targetOrgId,
      p_delta: delta,
      p_set_to: setTo,
      p_reason: reason,
      p_actor: user.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = data as {
      status: string;
      credit_balance?: number;
      credits_total?: number;
      adjustment_id?: string;
      delta?: number;
    } | null;

    if (!result || result.status === "no_org") {
      return NextResponse.json(
        { error: "Organizacao alvo nao encontrada." },
        { status: 404 }
      );
    }

    if (result.status === "unlimited_no_delta") {
      return NextResponse.json(
        { error: "Org ilimitada nao usa saldo. Use set_to para definir um saldo finito." },
        { status: 400 }
      );
    }

    if (result.status !== "ok") {
      return NextResponse.json(
        { error: "Falha ao aplicar a recarga." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      credit_balance: result.credit_balance,
      adjustment_id: result.adjustment_id,
      credits_total: result.credits_total,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

