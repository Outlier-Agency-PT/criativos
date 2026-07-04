import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { getImageCost } from "@/lib/models";
import {
  monthStartISO,
  getQuotaStatus,
  getCreditBalance,
  getDailyUsageSeries,
  dayStartUTCDaysAgo,
} from "@/lib/usage";

/** Dias da série de tendência quando from/to não delimitam o período. */
const TREND_DAYS = 30;

/**
 * Valida um parâmetro de data ISO vindo da query. Aceita 'YYYY-MM-DD' ou ISO
 * completo. Retorna a ISO string normalizada ou null se ausente/invalida.
 */
function parseISODate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * GET /api/usage
 *
 * Resumo de uso/custo da org agregado server-side a partir de
 * criativos_generation_logs (base de billing). Conta apenas logs com
 * status='completed'. Pagina os logs em lotes de 1000 e agrega em memória,
 * nunca devolve linha por linha pro cliente.
 *
 * Isolamento (RLS): usa o client autenticado de requireAuth (anon key), que
 * respeita a RLS endurecida da EP-14.02. NUNCA usa service key aqui, então o
 * cliente só enxerga a própria org.
 *
 * Query params (todos opcionais):
 *   - from: ISO date. Início da janela de custo/count. Default: início do mês.
 *   - to:   ISO date. Fim (exclusivo) da janela de custo/count. Default: agora.
 *
 * Contrato da resposta:
 *   - windowFrom, windowTo: ISO strings da janela efetiva de custo/count.
 *   - monthStart: alias de windowFrom (compat com clients antigos).
 *   - totalCount: criativos no período.
 *   - totalCostUsd: custo estimado total (USD) no período.
 *   - models: [{ model, provider, count, costUsd }] ordenado por count desc.
 *   - quota: status de quota (ver getQuotaStatus).
 *   - creditBalance: número (créditos restantes) ou null.
 *   - unlimited: true quando creditBalance é null (sem teto de crédito).
 *   - creditBalanceLabel: rótulo pronto pra UI ('ilimitado' quando unlimited).
 *   - trend: { from, to, days, series: [{ dia: 'YYYY-MM-DD', criativos, custo }] }
 *            Série diária com zeros inclusos. Janela = from/to quando passados,
 *            senão os ultimos TREND_DAYS dias.
 */
export async function GET(request: NextRequest) {
  try {
    const { orgId, supabase } = await requireAuth();

    const params = request.nextUrl.searchParams;
    const fromParam = parseISODate(params.get("from"));
    const toParam = parseISODate(params.get("to"));

    // Validacao: se ambos vierem e from > to, a janela e invalida (resultaria em
    // dados vazios). Rejeita explicitamente em vez de degradar pra resultado vazio.
    if (fromParam && toParam && fromParam > toParam) {
      return NextResponse.json(
        { error: "Janela invalida: 'from' deve ser anterior ou igual a 'to'." },
        { status: 400 },
      );
    }

    // Janela de custo/count: from/to quando passados, senao o mes corrente.
    const fromISO = fromParam ?? monthStartISO();
    const toISO = toParam ?? new Date().toISOString();

    // Janela da serie de tendencia: deriva de from/to quando passados; senao os
    // ultimos TREND_DAYS dias (mais o dia corrente).
    const trendFromISO = fromParam ?? dayStartUTCDaysAgo(TREND_DAYS - 1);
    const trendToISO = toISO;

    // Status de quota (limite x usado): reutiliza o helper compartilhado.
    const quota = await getQuotaStatus(supabase, orgId);

    // Saldo de credito atual da org. null = sem teto (ilimitado em consumo).
    const creditBalance = await getCreditBalance(supabase, orgId);

    // Agregação por modelo: paginada (range) pra não estourar o teto de 1000
    // rows do Supabase REST quando a org tem muito volume no mês.
    const PAGE = 1000;
    let offset = 0;
    let totalCount = 0;
    let totalCostUsd = 0;
    const byModel = new Map<string, { count: number; cost: number; provider: string }>();

    for (;;) {
      const { data, error } = await supabase
        .from("criativos_generation_logs")
        .select("model_used, provider, cost_usd")
        .eq("org_id", orgId)
        .eq("status", "completed")
        .gte("created_at", fromISO)
        .lt("created_at", toISO)
        .range(offset, offset + PAGE - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const rows = data ?? [];
      for (const row of rows) {
        const model = row.model_used || "desconhecido";
        // cost_usd vem do banco; fallback no catálogo se vier nulo (logs antigos).
        const cost = typeof row.cost_usd === "number" ? row.cost_usd : getImageCost(row.model_used);
        totalCount += 1;
        totalCostUsd += cost;
        const existing = byModel.get(model) ?? { count: 0, cost: 0, provider: row.provider || "" };
        byModel.set(model, {
          count: existing.count + 1,
          cost: existing.cost + cost,
          provider: existing.provider || row.provider || "",
        });
      }
      if (rows.length < PAGE) break;
      offset += PAGE;
    }

    const models = Array.from(byModel.entries())
      .map(([model, v]) => ({
        model,
        provider: v.provider,
        count: v.count,
        costUsd: Number(v.cost.toFixed(5)),
      }))
      .sort((a, b) => b.count - a.count);

    // Serie diaria de tendencia (zeros inclusos). Paginada internamente
    // (NFR-005). fallback no catalogo pra logs antigos sem cost_usd.
    const series = await getDailyUsageSeries(
      supabase,
      orgId,
      trendFromISO,
      trendToISO,
      (model) => getImageCost(model),
    );

    return NextResponse.json({
      windowFrom: fromISO,
      windowTo: toISO,
      monthStart: fromISO,
      totalCount,
      totalCostUsd: Number(totalCostUsd.toFixed(5)),
      models,
      quota,
      creditBalance,
      unlimited: creditBalance === null,
      creditBalanceLabel: creditBalance === null ? "ilimitado" : String(creditBalance),
      trend: {
        from: trendFromISO,
        to: trendToISO,
        days: series.length,
        series,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

