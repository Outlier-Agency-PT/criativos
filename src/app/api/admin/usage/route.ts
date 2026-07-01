import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  handleAuthError,
  createServiceSupabase,
} from "@/lib/api-auth";
import { monthStartISO } from "@/lib/usage";

/**
 * Valida um parametro de data ISO vindo da query. Aceita 'YYYY-MM-DD' ou ISO
 * completo. Retorna a ISO string normalizada ou null se ausente/invalida.
 */
function parseISODate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Acumulador de agregacao por org. */
interface OrgAcc {
  total_cost_usd: number;
  total_criativos: number;
}

/**
 * GET /api/admin/usage
 *
 * Visao TOTAL do Super Admin: agrega custo, numero de criativos e saldo POR
 * org, de TODAS as orgs, pra cobranca manual. Existe SO pro dono da plataforma
 * (EP-14.09).
 *
 * Guard (Super Admin, EP-14.01):
 *   1. requireAuth() valida o usuario autenticado (cookies Supabase) e resolve
 *      a org dele via organization_members. Sem sessao valida => 401.
 *   2. Le criativos_org_limits.is_super_admin DA ORG DO USUARIO. So passa se a
 *      flag canonica is_super_admin = true. NUNCA usa credit_balance IS NULL pra
 *      isso (uma org cliente recem-criada com saldo NULL nao vira admin).
 *      Qualquer outra org => 403.
 *   Por que nao e burlavel: o user vem do cookie de sessao verificado pelo
 *   Supabase (auth.getUser), nao de um header/body que o cliente controla. A
 *   org vem do membership real dele. A flag is_super_admin so e gravavel via
 *   service role (RLS nega escrita do cliente, EP-14.02), entao um cliente nao
 *   consegue se auto-promover.
 *
 * Isolamento (NFR-001): a visao cross-org existe SO via service role neste
 * backend, DEPOIS do guard. Nenhuma policy de RLS de cliente e relaxada. O
 * cliente comum nunca chega na agregacao (recebe 403 antes).
 *
 * Query params (opcionais):
 *   - from: ISO date. Inicio da janela. Default: inicio do mes corrente.
 *   - to:   ISO date. Fim (exclusivo) da janela. Default: agora.
 *
 * Resposta:
 *   {
 *     window: { from, to },
 *     orgs: [{ org_id, name, total_cost_usd, total_criativos, credit_balance, plan_label }]
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Valida o usuario autenticado e resolve a org dele.
    const { user, orgId: actorOrgId } = await requireAuth();

    // 2. Guard de Super Admin via flag canonica is_super_admin (EP-14.01).
    //    Le via service role pra evitar qualquer interferencia de RLS, mas a
    //    identidade (user + org) ja foi validada pelo client autenticado acima.
    const service = await createServiceSupabase();

    const { data: actorLimits, error: actorErr } = await service
      .from("criativos_org_limits")
      .select("is_super_admin")
      .eq("org_id", actorOrgId)
      .maybeSingle();

    if (actorErr) {
      return NextResponse.json({ error: actorErr.message }, { status: 500 });
    }
    if (actorLimits?.is_super_admin !== true) {
      // Cliente comum (nao Super Admin) nunca enxerga a visao cross-org.
      return NextResponse.json(
        { error: "Apenas Super Admin pode acessar a visao cross-org." },
        { status: 403 },
      );
    }

    // Auditoria leve: registra quem acessou a visao administrativa.
    console.log(
      `[admin/usage] super_admin=${user.id} org=${actorOrgId} acessou visao cross-org`,
    );

    // 3. Janela temporal: from/to quando passados, senao o mes corrente.
    const params = request.nextUrl.searchParams;
    const fromParam = parseISODate(params.get("from"));
    const toParam = parseISODate(params.get("to"));

    if (fromParam && toParam && fromParam > toParam) {
      return NextResponse.json(
        { error: "Janela invalida: 'from' deve ser anterior ou igual a 'to'." },
        { status: 400 },
      );
    }

    const fromISO = fromParam ?? monthStartISO();
    const toISO = toParam ?? new Date().toISOString();

    // 4. Cadastro de orgs + limites (organizations LEFT JOIN org_limits).
    //    Volume de orgs e baixo (tenants), mas paginamos por seguranca pra nao
    //    truncar em 1000 (NFR-005).
    const ORG_PAGE = 1000;
    let orgOffset = 0;
    const orgMeta = new Map<
      string,
      { name: string; credit_balance: number | null; plan_label: string | null }
    >();

    for (;;) {
      const { data, error } = await service
        .from("organizations")
        .select(
          "id, name, criativos_org_limits ( credit_balance, plan_label )",
        )
        .range(orgOffset, orgOffset + ORG_PAGE - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const rows = data ?? [];
      for (const row of rows) {
        // O embed de org_limits (PK org_id) vem como objeto ou array conforme o
        // PostgREST; normalizamos pra um unico registro.
        const limitsRaw = (row as { criativos_org_limits?: unknown })
          .criativos_org_limits;
        const limits = Array.isArray(limitsRaw) ? limitsRaw[0] : limitsRaw;
        const credit_balance =
          limits && typeof (limits as { credit_balance?: unknown }).credit_balance === "number"
            ? ((limits as { credit_balance: number }).credit_balance)
            : null;
        const plan_label =
          limits && typeof (limits as { plan_label?: unknown }).plan_label === "string"
            ? ((limits as { plan_label: string }).plan_label)
            : null;
        orgMeta.set(row.id as string, {
          name: (row.name as string) ?? "",
          credit_balance,
          plan_label,
        });
      }
      if (rows.length < ORG_PAGE) break;
      orgOffset += ORG_PAGE;
    }

    // 5. Agregacao cross-org de criativos_generation_logs (status='completed')
    //    na janela. Cross-org => volume alto: paginamos com .range em loop e
    //    agregamos em memoria por org_id. NUNCA truncamos em 1000 (NFR-005).
    const LOG_PAGE = 1000;
    let logOffset = 0;
    const byOrg = new Map<string, OrgAcc>();

    for (;;) {
      const { data, error } = await service
        .from("criativos_generation_logs")
        .select("org_id, cost_usd")
        .eq("status", "completed")
        .gte("created_at", fromISO)
        .lt("created_at", toISO)
        .order("created_at", { ascending: true })
        .range(logOffset, logOffset + LOG_PAGE - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const rows = data ?? [];
      for (const row of rows) {
        const orgIdRow = row.org_id as string;
        const cost = typeof row.cost_usd === "number" ? row.cost_usd : 0;
        const acc = byOrg.get(orgIdRow) ?? { total_cost_usd: 0, total_criativos: 0 };
        acc.total_cost_usd += cost;
        acc.total_criativos += 1;
        byOrg.set(orgIdRow, acc);
      }
      if (rows.length < LOG_PAGE) break;
      logOffset += LOG_PAGE;
    }

    // 6. Monta a resposta: uma linha por org cadastrada (inclui orgs sem
    //    geracao no periodo, com totais zerados), enriquecida com o agregado.
    const orgs = Array.from(orgMeta.entries())
      .map(([org_id, meta]) => {
        const acc = byOrg.get(org_id) ?? { total_cost_usd: 0, total_criativos: 0 };
        return {
          org_id,
          name: meta.name,
          total_cost_usd: Number(acc.total_cost_usd.toFixed(5)),
          total_criativos: acc.total_criativos,
          credit_balance: meta.credit_balance,
          plan_label: meta.plan_label,
        };
      })
      .sort((a, b) => b.total_cost_usd - a.total_cost_usd);

    return NextResponse.json({
      window: { from: fromISO, to: toISO },
      orgs,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

