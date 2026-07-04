/**
 * Helpers de uso / quota / billing.
 *
 * Centraliza: (1) cálculo do início do mês civil (UTC), (2) contagem do uso
 * do mês a partir de criativos_generation_logs, (3) leitura do limite mensal
 * da org e (4) enforcement de quota. Compartilhado entre o endpoint de
 * geração (generate/one) e a API agregada de uso (/api/usage).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Início do mês civil corrente em UTC (ISO string). */
export function monthStartISO(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Conta quantos criativos a org gerou no mês corrente (logs com status completed).
 * Usa count exato com head:true: não traz linhas, só o número (rápido e sem
 * estourar o limite de 1000 rows do Supabase REST).
 */
export async function getMonthlyUsage(
  supabase: SupabaseClient,
  orgId: string,
  fromISO: string = monthStartISO()
): Promise<number> {
  const { count, error } = await supabase
    .from("criativos_generation_logs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "completed")
    .gte("created_at", fromISO);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Limite mensal da org. NULL = ilimitado (sem linha em criativos_org_limits
 * ou limite explicitamente nulo).
 *
 * DEPRECADO pelo modelo de billing por crédito pré-pago (EP-14): o gate de quota
 * passou a olhar credit_balance (ver getCreditBalance/getQuotaStatus). Mantido só
 * pra contexto legado e pra orgs que ainda exibam o limite mensal histórico.
 */
export async function getMonthlyLimit(
  supabase: SupabaseClient,
  orgId: string
): Promise<number | null> {
  const { data } = await supabase
    .from("criativos_org_limits")
    .select("monthly_generation_limit")
    .eq("org_id", orgId)
    .maybeSingle();
  const limit = data?.monthly_generation_limit;
  return typeof limit === "number" ? limit : null;
}

/**
 * Saldo de créditos pré-pago da org (EP-14). Convenções:
 *   - número >= 0 = créditos restantes (0 = esgotado).
 *   - null        = ilimitado em consumo (org bypassa quota e decremento) OU
 *                   org sem row em criativos_org_limits.
 *
 * Observação de segurança: a fonte de verdade do enforcement é a RPC atômica
 * decrement_credit (que nega org sem row). Aqui o null é apenas o sinal de
 * "não bloquear no pre-check": o gate final continua sendo a RPC.
 */
export async function getCreditBalance(
  supabase: SupabaseClient,
  orgId: string
): Promise<number | null> {
  const { data } = await supabase
    .from("criativos_org_limits")
    .select("credit_balance")
    .eq("org_id", orgId)
    .maybeSingle();
  const balance = data?.credit_balance;
  return typeof balance === "number" ? balance : null;
}

/** Um ponto da série diária de uso (base do gráfico de tendência, FR-012). */
export interface DailyUsagePoint {
  /** Data civil em UTC no formato 'YYYY-MM-DD'. */
  dia: string;
  /** Criativos gerados nesse dia (logs com status completed). */
  criativos: number;
  /** Custo total estimado nesse dia em USD. */
  custo: number;
}

/** Início do dia civil (UTC) N dias atrás, como ISO string. */
export function dayStartUTCDaysAgo(days: number, now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/** Chave de dia civil ('YYYY-MM-DD') em UTC a partir de um timestamp ISO. */
function dayKeyUTC(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Série diária de uso da org num intervalo [fromISO, toISO), agrupada por dia
 * civil (UTC). Base do gráfico de tendência (FR-012).
 *
 * Inclui TODOS os dias do intervalo, mesmo os sem geração (criativos=0, custo=0),
 * pra o gráfico não ter buracos.
 *
 * Paginação (NFR-005): generation_logs pode passar de 1000 linhas no período;
 * lê em lotes de 1000 com .range em loop e agrega em memória. Usa o client
 * autenticado (anon key) recebido por parâmetro, então a RLS limita à org do
 * usuário. Nunca usa service key aqui.
 *
 * fallbackCost (opcional): função pra estimar custo de logs antigos sem cost_usd
 * gravado (ex: getImageCost do catálogo). Quando ausente, custo nulo conta zero.
 */
export async function getDailyUsageSeries(
  supabase: SupabaseClient,
  orgId: string,
  fromISO: string,
  toISO: string = new Date().toISOString(),
  fallbackCost?: (model: string | null) => number
): Promise<DailyUsagePoint[]> {
  const PAGE = 1000;
  let offset = 0;
  const counts = new Map<string, { criativos: number; custo: number }>();

  for (;;) {
    const { data, error } = await supabase
      .from("criativos_generation_logs")
      .select("model_used, cost_usd, created_at")
      .eq("org_id", orgId)
      .eq("status", "completed")
      .gte("created_at", fromISO)
      .lt("created_at", toISO)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) break;
    const rows = data ?? [];
    for (const row of rows) {
      const dia = dayKeyUTC(row.created_at as string);
      const cost = typeof row.cost_usd === "number"
        ? row.cost_usd
        : (fallbackCost ? fallbackCost(row.model_used) : 0);
      const acc = counts.get(dia) ?? { criativos: 0, custo: 0 };
      acc.criativos += 1;
      acc.custo += cost;
      counts.set(dia, acc);
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  // Monta todos os dias do intervalo (zeros inclusos) entre o dia de fromISO e
  // o dia de toISO (inclusive o dia corrente de toISO).
  const series: DailyUsagePoint[] = [];
  const start = new Date(fromISO);
  const startDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const end = new Date(toISO);
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  for (let d = startDay; d <= endDay; d.setUTCDate(d.getUTCDate() + 1)) {
    const dia = d.toISOString().slice(0, 10);
    const acc = counts.get(dia) ?? { criativos: 0, custo: 0 };
    series.push({ dia, criativos: acc.criativos, custo: Number(acc.custo.toFixed(5)) });
  }
  return series;
}

export interface QuotaStatus {
  /** Limite mensal legado (informativo). Saldo pré-pago vive em creditBalance. */
  limit: number | null;
  used: number;
  remaining: number | null;
  exceeded: boolean;
  /** Saldo de créditos pré-pago (EP-14). null = ilimitado. */
  creditBalance: number | null;
}

/**
 * Status de quota da org pro mês corrente (modelo de crédito pré-pago, EP-14).
 *
 * exceeded passa a refletir o SALDO DE CRÉDITO, não o limite mensal:
 *   - credit_balance IS NULL  -> ilimitado, exceeded=false (bypass).
 *   - credit_balance <= 0     -> esgotado, exceeded=true.
 *   - credit_balance > 0      -> tem saldo, exceeded=false.
 *
 * Os campos limit/used/remaining são preservados pra compatibilidade com o
 * dashboard (/api/usage): limit é o limite mensal legado (informativo) e used é
 * o consumo do mês. remaining passa a ser o saldo de crédito quando há saldo
 * finito (mais relevante pro usuário pré-pago).
 */
export async function getQuotaStatus(
  supabase: SupabaseClient,
  orgId: string
): Promise<QuotaStatus> {
  const fromISO = monthStartISO();
  const [limit, used, creditBalance] = await Promise.all([
    getMonthlyLimit(supabase, orgId),
    getMonthlyUsage(supabase, orgId, fromISO),
    getCreditBalance(supabase, orgId),
  ]);
  // Bypass ilimitado: credit_balance IS NULL nunca está esgotado.
  if (creditBalance === null) {
    return { limit, used, remaining: limit === null ? null : Math.max(0, limit - used), exceeded: false, creditBalance: null };
  }
  return {
    limit,
    used,
    remaining: creditBalance,
    exceeded: creditBalance <= 0,
    creditBalance,
  };
}

