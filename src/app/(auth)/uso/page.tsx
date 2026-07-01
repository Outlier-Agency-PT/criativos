"use client";


import { useState, useEffect, useMemo } from "react";
import {
  BarChart3,
  Image,
  DollarSign,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Calendar,
  Loader2,
  Key,
  Activity,
  Calculator,
  RefreshCw,
  Infinity as InfinityIcon,
  Wallet,
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";
import { AI_MODELS } from "@/lib/models";

interface Creative {
  id: string;
  status: string;
  model_used: string | null;
  provider_used: string | null;
  generation_time_ms: number | null;
  created_at: string;
  project_id: string;
}

interface ApiKeyInfo {
  id: string;
  label: string;
  provider: string;
  model: string;
  is_active: boolean;
  last_used_at: string | null;
  error_count: number;
  last_error: string | null;
}

interface DailyUsage {
  date: string;
  count: number;
  cost: number;
}

interface TrendPoint {
  dia: string;
  criativos: number;
  custo: number;
}

interface UsageSummary {
  monthStart: string;
  totalCount: number;
  totalCostUsd: number;
  models: { model: string; provider: string; count: number; costUsd: number }[];
  quota: { limit: number | null; used: number; remaining: number | null; exceeded: boolean };
  creditBalance: number | null;
  unlimited: boolean;
  creditBalanceLabel: string;
  trend: { from: string; to: string; days: number; series: TrendPoint[] };
}

// Limiar de saldo baixo: abaixo disso o saldo de creditos e destacado em alerta
// com orientacao pra recarregar. Recarga e manual (sem gateway de pagamento).
const LOW_BALANCE_THRESHOLD = 20;

const BRL_FALLBACK = 5.65;

async function fetchUsdBrl(): Promise<number> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 3600 } });
    if (!res.ok) return BRL_FALLBACK;
    const data = await res.json();
    return data.rates?.BRL ?? BRL_FALLBACK;
  } catch {
    return BRL_FALLBACK;
  }
}

export default function UsoPage() {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("30d");
  const [isAdmin, setIsAdmin] = useState(false);
  const [usdBrl, setUsdBrl] = useState(BRL_FALLBACK);
  const [simQty, setSimQty] = useState(100);
  // Resumo de billing do mÃªs corrente, agregado server-side a partir de
  // criativos_generation_logs (base de cobranÃ§a por uso).
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  // EdiÃ§Ã£o do limite mensal (quota) â€” admin only.
  const [limitInput, setLimitInput] = useState<string>("");
  const [savingLimit, setSavingLimit] = useState(false);
  const [limitSaved, setLimitSaved] = useState(false);

  const reloadSummary = () =>
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSummary(d))
      .catch(() => setSummary(null));

  useEffect(() => {
    // Fonte de verdade de billing: API agregada (logs do mÃªs). Independente da
    // varredura client-side de criativos abaixo (que mostra histÃ³rico/performance).
    reloadSummary();
    fetch("/api/org-limits")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLimitInput(d?.monthlyGenerationLimit != null ? String(d.monthlyGenerationLimit) : ""))
      .catch(() => {});
  }, []);

  async function saveLimit() {
    setSavingLimit(true);
    setLimitSaved(false);
    try {
      const res = await fetch("/api/org-limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyGenerationLimit: limitInput.trim() === "" ? null : Number(limitInput) }),
      });
      if (res.ok) {
        setLimitSaved(true);
        await reloadSummary();
      }
    } finally {
      setSavingLimit(false);
    }
  }

  useEffect(() => {
    async function loadData() {
      const supabase = createBrowserSupabase();

      const [, rate] = await Promise.all([
        (async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: membership } = await supabase
            .from("organization_members")
            .select("org_id, role")
            .eq("user_id", user.id)
            .limit(1)
            .single();

          const orgId = membership?.org_id;
          const role = membership?.role || "member";
          setIsAdmin(role === "owner" || role === "admin");

          const { data: creativesData } = await supabase
            .from("criativos_creatives")
            .select("id, status, model_used, provider_used, generation_time_ms, created_at, project_id")
            .order("created_at", { ascending: false });

          setCreatives(creativesData ?? []);

          if (orgId && (role === "owner" || role === "admin")) {
            const { data: keysData } = await supabase
              .from("criativos_api_keys")
              .select("id, label, provider, model, is_active, last_used_at, error_count, last_error")
              .eq("org_id", orgId)
              .order("priority", { ascending: true });

            setApiKeys(keysData ?? []);
          }
        })(),
        fetchUsdBrl(),
      ]);

      setUsdBrl(rate);
      setLoading(false);
    }

    loadData();
  }, []);

  const filteredCreatives = useMemo(() => {
    if (period === "all") return creatives;
    const days = period === "7d" ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return creatives.filter((c) => new Date(c.created_at) >= cutoff);
  }, [creatives, period]);

  const metrics = useMemo(() => {
    const costMap = new Map(AI_MODELS.map((m) => [m.id, m.costPerImage]));

    const completed = filteredCreatives.filter((c) => c.status === "completed");
    const errors = filteredCreatives.filter((c) => c.status === "error");

    let totalCost = 0;
    let totalGenTime = 0;
    let genTimeCount = 0;
    let fastestGen = Infinity;
    let slowestGen = 0;

    const modelCounts = new Map<string, { count: number; cost: number; totalTime: number; timeCount: number }>();
    const providerCounts = new Map<string, number>();

    for (const c of completed) {
      const modelId = c.model_used || "gemini-2.5-flash";
      const costPerImage = costMap.get(modelId) ?? 0.039;
      totalCost += costPerImage;

      const existing = modelCounts.get(modelId) ?? { count: 0, cost: 0, totalTime: 0, timeCount: 0 };
      modelCounts.set(modelId, {
        count: existing.count + 1,
        cost: existing.cost + costPerImage,
        totalTime: existing.totalTime + (c.generation_time_ms ?? 0),
        timeCount: existing.timeCount + (c.generation_time_ms ? 1 : 0),
      });

      const provider = c.provider_used || "gemini";
      providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);

      if (c.generation_time_ms) {
        totalGenTime += c.generation_time_ms;
        genTimeCount++;
        if (c.generation_time_ms < fastestGen) fastestGen = c.generation_time_ms;
        if (c.generation_time_ms > slowestGen) slowestGen = c.generation_time_ms;
      }
    }

    const dailyMap = new Map<string, { count: number; cost: number }>();
    for (const c of completed) {
      const day = new Date(c.created_at).toISOString().split("T")[0];
      const modelId = c.model_used || "gemini-2.5-flash";
      const costPerImage = costMap.get(modelId) ?? 0.039;
      const existing = dailyMap.get(day) ?? { count: 0, cost: 0 };
      dailyMap.set(day, { count: existing.count + 1, cost: existing.cost + costPerImage });
    }

    const dailyUsage: DailyUsage[] = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      total: filteredCreatives.length,
      completed: completed.length,
      errors: errors.length,
      totalCost,
      avgGenTime: genTimeCount > 0 ? totalGenTime / genTimeCount / 1000 : 0,
      fastestGen: fastestGen === Infinity ? 0 : fastestGen / 1000,
      slowestGen: slowestGen / 1000,
      successRate: (completed.length + errors.length) > 0 ? (completed.length / (completed.length + errors.length)) * 100 : 0,
      modelUsage: Array.from(modelCounts.entries())
        .map(([model, data]) => ({
          model,
          count: data.count,
          cost: data.cost,
          avgTime: data.timeCount > 0 ? data.totalTime / data.timeCount / 1000 : 0,
        }))
        .sort((a, b) => b.count - a.count),
      providerUsage: Array.from(providerCounts.entries())
        .map(([provider, count]) => ({ provider, count }))
        .sort((a, b) => b.count - a.count),
      dailyUsage,
    };
  }, [filteredCreatives]);

  const maxDaily = Math.max(...metrics.dailyUsage.map((d) => d.count), 1);

  // Saldo baixo: org com teto de credito (nao ilimitado) e saldo abaixo do limiar.
  const lowBalance =
    summary != null &&
    !summary.unlimited &&
    summary.creditBalance != null &&
    summary.creditBalance < LOW_BALANCE_THRESHOLD;

  // Pico da serie de tendencia, pra normalizar a altura das barras (min 1).
  const maxTrend = summary
    ? Math.max(...summary.trend.series.map((p) => p.criativos), 1)
    : 1;

  const fmtBrl = (usd: number) => (usd * usdBrl).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary flex items-center gap-2">
            <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6" />
            Uso e Custos
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Consumo de API, custos por modelo e performance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-text-muted flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            USD/BRL {usdBrl.toFixed(2)}
          </span>
          <div className="flex gap-0.5 bg-surface-050 rounded-lg border border-border-subtle p-0.5">
            {([["7d", "7d"], ["30d", "30d"], ["all", "Tudo"]] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                  period === value
                    ? "bg-accent-champagne text-surface-900"
                    : "text-text-muted hover:text-text-primary"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Resumo de billing do mÃªs (fonte: criativos_generation_logs) */}
      {summary && (
        <div className="rounded-xl bg-surface-050 border border-border-subtle overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Calendar className="w-4 h-4 text-accent-champagne" />
              Faturamento do mÃªs
            </h3>
            <span className="text-[11px] text-text-muted">
              desde {new Date(summary.monthStart).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-border-subtle">
            <div className="p-4">
              <p className="text-lg sm:text-xl font-bold text-text-primary">{summary.totalCount}</p>
              <p className="text-[11px] text-text-muted mt-0.5">Criativos no mÃªs</p>
            </div>
            <div className="p-4">
              <p className="text-lg sm:text-xl font-bold text-accent-champagne">${summary.totalCostUsd.toFixed(2)}</p>
              <p className="text-[11px] text-text-muted mt-0.5">Custo estimado (USD)</p>
            </div>
            <div className="p-4">
              <p className="text-lg sm:text-xl font-bold text-emerald-400">{fmtBrl(summary.totalCostUsd)}</p>
              <p className="text-[11px] text-text-muted mt-0.5">Custo estimado (BRL)</p>
            </div>
            <div className="p-4">
              <p className={cn(
                "text-lg sm:text-xl font-bold",
                summary.quota.limit === null
                  ? "text-text-primary"
                  : summary.quota.exceeded
                    ? "text-red-400"
                    : "text-text-primary"
              )}>
                {summary.quota.limit === null
                  ? "Ilimitado"
                  : `${summary.quota.used}/${summary.quota.limit}`}
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">Limite mensal</p>
            </div>
            <div className="p-4">
              <p className={cn(
                "text-lg sm:text-xl font-bold flex items-center gap-1.5",
                summary.unlimited
                  ? "text-text-primary"
                  : lowBalance
                    ? "text-red-400"
                    : "text-text-primary"
              )}>
                {summary.unlimited ? (
                  <>
                    <InfinityIcon className="w-4 h-4 text-accent-champagne" />
                    Ilimitado
                  </>
                ) : (
                  <>
                    {!summary.unlimited && lowBalance && <AlertTriangle className="w-4 h-4" />}
                    {summary.creditBalanceLabel}
                  </>
                )}
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">Saldo de crÃ©ditos</p>
            </div>
          </div>

          {/* Alerta de saldo baixo: recarga e manual pelo admin (sem gateway). */}
          {!summary.unlimited && lowBalance && (
            <div className="px-4 sm:px-5 pb-4">
              <div className="flex items-start gap-2.5 rounded-lg bg-red-500/10 border border-red-500/30 px-3.5 py-3">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-red-400">
                    Saldo baixo: {summary.creditBalanceLabel} crÃ©dito{summary.creditBalance === 1 ? "" : "s"} restante{summary.creditBalance === 1 ? "" : "s"}.
                  </p>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    Contate o administrador para recarregar e evitar que novas geraÃ§Ãµes sejam bloqueadas.
                  </p>
                </div>
              </div>
            </div>
          )}
          {summary.quota.limit !== null && (
            <div className="px-4 sm:px-5 pb-4">
              <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    summary.quota.exceeded ? "bg-red-400" : "bg-accent-champagne"
                  )}
                  style={{ width: `${Math.min(100, summary.quota.limit > 0 ? (summary.quota.used / summary.quota.limit) * 100 : 0)}%` }}
                />
              </div>
              {summary.quota.exceeded && (
                <p className="text-[11px] text-red-400 mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Limite mensal atingido. Novas geraÃ§Ãµes ficam bloqueadas atÃ© o prÃ³ximo mÃªs ou aumento do limite.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* TendÃªncia dos Ãºltimos 30 dias (fonte: /api/usage trend.series) */}
      {summary && (
        <div className="rounded-xl bg-surface-050 border border-border-subtle overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent-champagne" />
              TendÃªncia dos Ãºltimos 30 dias
            </h3>
            <span className="text-[11px] text-text-muted">
              {summary.trend.series.reduce((s, p) => s + p.criativos, 0)} criativos no perÃ­odo
            </span>
          </div>
          <div className="p-4 sm:p-5">
            {summary.trend.series.every((p) => p.criativos === 0) ? (
              <p className="text-sm text-text-muted text-center py-8">Sem geraÃ§Ãµes nos Ãºltimos 30 dias.</p>
            ) : (
              <>
                <div className="flex items-end gap-[3px] h-32" role="img" aria-label="GrÃ¡fico de barras de criativos gerados por dia nos Ãºltimos 30 dias">
                  {summary.trend.series.map((p) => {
                    const heightPct = (p.criativos / maxTrend) * 100;
                    const label = new Date(p.dia + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                    return (
                      <div
                        key={p.dia}
                        className="flex-1 flex flex-col justify-end h-full group relative"
                        title={`${label}: ${p.criativos} criativo${p.criativos === 1 ? "" : "s"} Â· $${p.custo.toFixed(2)}`}
                      >
                        <div
                          className={cn(
                            "w-full rounded-t-sm transition-all",
                            p.criativos > 0 ? "bg-accent-champagne/70 group-hover:bg-accent-champagne" : "bg-surface-200"
                          )}
                          style={{ height: p.criativos > 0 ? `${Math.max(4, heightPct)}%` : "2px" }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-text-muted font-mono">
                  <span>
                    {summary.trend.series.length > 0
                      ? new Date(summary.trend.series[0].dia + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                      : ""}
                  </span>
                  <span>
                    {summary.trend.series.length > 0
                      ? new Date(summary.trend.series[summary.trend.series.length - 1].dia + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                      : ""}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Breakdown por modelo (fonte de billing: /api/usage models) */}
      {summary && summary.models.length > 0 && (
        <div className="rounded-xl bg-surface-050 border border-border-subtle overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-border-subtle">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Wallet className="w-4 h-4 text-accent-champagne" />
              Custo por modelo no mÃªs
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-border-subtle text-text-muted text-xs">
                  <th className="text-left px-4 sm:px-5 py-3 font-medium">Modelo</th>
                  <th className="text-left px-3 py-3 font-medium">Provider</th>
                  <th className="text-right px-3 py-3 font-medium">Criativos</th>
                  <th className="text-right px-3 py-3 font-medium">Custo USD</th>
                  <th className="text-right px-4 sm:px-5 py-3 font-medium">Custo BRL</th>
                </tr>
              </thead>
              <tbody>
                {summary.models.map((m) => {
                  const modelInfo = AI_MODELS.find((am) => am.id === m.model);
                  return (
                    <tr key={m.model} className="border-b border-border-subtle last:border-b-0 hover:bg-surface-100/50">
                      <td className="px-4 sm:px-5 py-3 font-medium text-text-primary">{modelInfo?.name ?? m.model}</td>
                      <td className="px-3 py-3 text-text-muted capitalize text-xs">{m.provider || "-"}</td>
                      <td className="text-right px-3 py-3 text-text-primary font-semibold">{m.count}</td>
                      <td className="text-right px-3 py-3 text-accent-champagne font-semibold">${m.costUsd.toFixed(2)}</td>
                      <td className="text-right px-4 sm:px-5 py-3 text-emerald-400 font-medium text-xs">{fmtBrl(m.costUsd)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-surface-100">
                  <td className="px-4 sm:px-5 py-3 font-semibold text-text-primary" colSpan={2}>Total</td>
                  <td className="text-right px-3 py-3 font-semibold text-text-primary">{summary.totalCount}</td>
                  <td className="text-right px-3 py-3 font-semibold text-accent-champagne">${summary.totalCostUsd.toFixed(2)}</td>
                  <td className="text-right px-4 sm:px-5 py-3 font-semibold text-emerald-400 text-xs">{fmtBrl(summary.totalCostUsd)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Editor de limite mensal (quota) â€” admin only */}
      {isAdmin && (
        <div className="rounded-xl bg-surface-050 border border-border-subtle p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-amber-400" />
            Limite mensal de geraÃ§Ã£o
          </h3>
          <p className="text-xs text-text-muted mb-3">
            Teto de criativos por mÃªs para esta organizaÃ§Ã£o. Deixe vazio para ilimitado. Ao atingir o limite,
            novas geraÃ§Ãµes ficam bloqueadas atÃ© o prÃ³ximo mÃªs.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              placeholder="Ilimitado"
              value={limitInput}
              onChange={(e) => { setLimitInput(e.target.value); setLimitSaved(false); }}
              className="w-40 px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm font-mono focus:outline-none focus:border-accent-champagne"
            />
            <button
              onClick={saveLimit}
              disabled={savingLimit}
              className="px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {savingLimit ? "Salvando..." : "Salvar"}
            </button>
            {limitSaved && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Salvo
              </span>
            )}
          </div>
        </div>
      )}

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Image} label="Total gerados" value={metrics.total} color="text-blue-400" />
        <StatCard icon={CheckCircle2} label="Completos" value={metrics.completed} color="text-green-400" />
        <StatCard icon={XCircle} label="Erros" value={metrics.errors} color="text-red-400" />
        <StatCard icon={DollarSign} label="Custo (USD)" value={`$${metrics.totalCost.toFixed(2)}`} color="text-yellow-400" />
        <StatCard icon={DollarSign} label="Custo (BRL)" value={fmtBrl(metrics.totalCost)} color="text-emerald-400" />
        <StatCard icon={Zap} label="Taxa sucesso" value={`${metrics.successRate.toFixed(0)}%`} color="text-cyan-400" />
      </div>

      {/* Performance + Historico diario */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Performance */}
        <div className="rounded-xl bg-surface-050 border border-border-subtle p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-cyan-400" />
            Performance de Geracao
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="text-center">
              <p className="text-lg sm:text-xl font-bold text-green-400">
                {metrics.fastestGen > 0 ? `${metrics.fastestGen.toFixed(1)}s` : "-"}
              </p>
              <p className="text-[11px] text-text-muted">Mais rapido</p>
            </div>
            <div className="text-center">
              <p className="text-lg sm:text-xl font-bold text-accent-champagne">
                {metrics.avgGenTime > 0 ? `${metrics.avgGenTime.toFixed(1)}s` : "-"}
              </p>
              <p className="text-[11px] text-text-muted">Media</p>
            </div>
            <div className="text-center">
              <p className="text-lg sm:text-xl font-bold text-red-400">
                {metrics.slowestGen > 0 ? `${metrics.slowestGen.toFixed(1)}s` : "-"}
              </p>
              <p className="text-[11px] text-text-muted">Mais lento</p>
            </div>
          </div>
          {metrics.providerUsage.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <p className="text-xs text-text-muted mb-2">Providers usados</p>
              <div className="flex flex-wrap gap-2">
                {metrics.providerUsage.map((p) => (
                  <span key={p.provider} className="px-2.5 py-1 rounded-full text-xs bg-surface-100 text-text-primary font-medium">
                    {p.provider} ({p.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Historico diario */}
        <div className="rounded-xl bg-surface-050 border border-border-subtle p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-purple-400" />
            Geracao por dia
          </h3>
          {metrics.dailyUsage.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Sem dados no periodo.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {metrics.dailyUsage.slice(-14).map((day) => (
                <div key={day.date} className="flex items-center gap-2 sm:gap-3">
                  <span className="text-[11px] text-text-muted w-12 sm:w-14 flex-shrink-0 font-mono">
                    {new Date(day.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </span>
                  <div className="flex-1 h-4 sm:h-5 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-champagne/60 rounded-full transition-all"
                      style={{ width: `${(day.count / maxDaily) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-text-primary font-medium w-6 text-right">{day.count}</span>
                  <span className="text-[11px] text-text-muted w-12 text-right">${day.cost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Consumo por modelo */}
      <div className="rounded-xl bg-surface-050 border border-border-subtle overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-border-subtle">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent-champagne" />
            Consumo por modelo
          </h3>
        </div>
        {metrics.modelUsage.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">Sem dados no periodo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border-subtle text-text-muted text-xs">
                  <th className="text-left px-4 sm:px-5 py-3 font-medium">Modelo</th>
                  <th className="text-right px-3 py-3 font-medium">Imgs</th>
                  <th className="text-right px-3 py-3 font-medium">$/img</th>
                  <th className="text-right px-3 py-3 font-medium">Total USD</th>
                  <th className="text-right px-3 py-3 font-medium">Total BRL</th>
                  <th className="text-right px-3 py-3 font-medium">Tempo</th>
                  <th className="text-right px-4 sm:px-5 py-3 font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {metrics.modelUsage.map((m) => {
                  const modelInfo = AI_MODELS.find((am) => am.id === m.model);
                  const pct = metrics.completed > 0 ? (m.count / metrics.completed) * 100 : 0;
                  return (
                    <tr key={m.model} className="border-b border-border-subtle last:border-b-0 hover:bg-surface-100/50">
                      <td className="px-4 sm:px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">{modelInfo?.name ?? m.model}</span>
                          {modelInfo?.recommended && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/10 text-yellow-400">PRO</span>
                          )}
                        </div>
                        <span className="text-text-muted text-[11px] font-mono hidden sm:inline">{m.model}</span>
                      </td>
                      <td className="text-right px-3 py-3 text-text-primary font-semibold">{m.count}</td>
                      <td className="text-right px-3 py-3 text-text-muted text-xs">${(modelInfo?.costPerImage ?? 0.039).toFixed(3)}</td>
                      <td className="text-right px-3 py-3 text-accent-champagne font-semibold">${m.cost.toFixed(2)}</td>
                      <td className="text-right px-3 py-3 text-emerald-400 font-medium text-xs">{fmtBrl(m.cost)}</td>
                      <td className="text-right px-3 py-3 text-text-muted text-xs">
                        {m.avgTime > 0 ? `${m.avgTime.toFixed(1)}s` : "-"}
                      </td>
                      <td className="text-right px-4 sm:px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-2 bg-surface-200 rounded-full overflow-hidden hidden sm:block">
                            <div className="h-full bg-accent-champagne rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-text-muted w-8 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-surface-100">
                  <td className="px-4 sm:px-5 py-3 font-semibold text-text-primary">Total</td>
                  <td className="text-right px-3 py-3 font-semibold text-text-primary">
                    {metrics.modelUsage.reduce((s, m) => s + m.count, 0)}
                  </td>
                  <td className="text-right px-3 py-3"></td>
                  <td className="text-right px-3 py-3 font-semibold text-accent-champagne">${metrics.totalCost.toFixed(2)}</td>
                  <td className="text-right px-3 py-3 font-semibold text-emerald-400 text-xs">{fmtBrl(metrics.totalCost)}</td>
                  <td className="text-right px-3 py-3"></td>
                  <td className="text-right px-4 sm:px-5 py-3 text-text-muted text-[11px]">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Simulador de custos */}
      <div className="rounded-xl bg-surface-050 border border-border-subtle overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-border-subtle">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Calculator className="w-4 h-4 text-purple-400" />
            Simulador de custo mensal
          </h3>
          <p className="text-xs text-text-muted mt-1">
            Estimativa para <strong className="text-text-primary">{simQty}</strong> imagens/mes
            <span className="ml-2 text-text-muted">(USD 1 = R$ {usdBrl.toFixed(2)})</span>
          </p>
        </div>

        <div className="px-4 sm:px-5 py-4 border-b border-border-subtle">
          <label className="text-xs text-text-muted block mb-2">Quantidade de imagens por mes</label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={simQty}
              onChange={(e) => setSimQty(Number(e.target.value))}
              className="flex-1 accent-accent-champagne h-2"
            />
            <input
              type="number"
              min={1}
              max={10000}
              value={simQty}
              onChange={(e) => setSimQty(Math.max(1, Number(e.target.value)))}
              className="w-20 px-2 py-1.5 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm text-center font-mono focus:outline-none focus:border-accent-champagne"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-border-subtle text-text-muted text-xs">
                <th className="text-left px-4 sm:px-5 py-3 font-medium">Modelo</th>
                <th className="text-right px-3 py-3 font-medium">$/img</th>
                <th className="text-right px-3 py-3 font-medium">R$/img</th>
                <th className="text-right px-3 py-3 font-medium">{simQty} imgs (USD)</th>
                <th className="text-right px-4 sm:px-5 py-3 font-medium">{simQty} imgs (BRL)</th>
              </tr>
            </thead>
            <tbody>
              {AI_MODELS.map((m) => {
                const totalUsd = m.costPerImage * simQty;
                return (
                  <tr key={m.id} className="border-b border-border-subtle last:border-b-0 hover:bg-surface-100/50">
                    <td className="px-4 sm:px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary text-xs sm:text-sm">{m.name}</span>
                        {m.recommended && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/10 text-yellow-400">PRO</span>
                        )}
                      </div>
                      <span className="text-[11px] text-text-muted">{m.maxResolution} Â· {m.supportsImageInput ? "com refs" : "sem refs"}</span>
                    </td>
                    <td className="text-right px-3 py-3 text-text-muted text-xs font-mono">${m.costPerImage.toFixed(3)}</td>
                    <td className="text-right px-3 py-3 text-text-muted text-xs font-mono">
                      R$ {(m.costPerImage * usdBrl).toFixed(2)}
                    </td>
                    <td className="text-right px-3 py-3 text-accent-champagne font-semibold">${totalUsd.toFixed(2)}</td>
                    <td className="text-right px-4 sm:px-5 py-3 text-emerald-400 font-semibold">{fmtBrl(totalUsd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status das API Keys - admin only */}
      {isAdmin && apiKeys.length > 0 && (
        <div className="rounded-xl bg-surface-050 border border-border-subtle overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-border-subtle">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              Saude das API Keys
            </h3>
          </div>
          <div className="divide-y divide-border-subtle">
            {apiKeys.map((k) => (
              <div key={k.id} className="px-4 sm:px-5 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", k.is_active ? "bg-green-400" : "bg-red-400")} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-text-primary">{k.label}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-100 text-text-muted">{k.provider}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent-champagne/10 text-accent-champagne">
                        {AI_MODELS.find((m) => m.id === k.model)?.name ?? k.model}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-text-muted">
                      {k.last_used_at && (
                        <span>Ultimo uso: {new Date(k.last_used_at).toLocaleDateString("pt-BR")}</span>
                      )}
                      {k.error_count > 0 && (
                        <span className="flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="w-3 h-3" />
                          {k.error_count} erro{k.error_count !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <span className={cn(
                  "px-2 py-1 rounded-full text-[10px] font-medium self-start sm:self-center flex-shrink-0",
                  k.is_active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                )}>
                  {k.is_active ? "Ativa" : "Inativa"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela de precos */}
      <div className="rounded-xl bg-surface-050 border border-border-subtle overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-border-subtle">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-yellow-400" />
            Tabela de precos por modelo
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[550px]">
            <thead>
              <tr className="border-b border-border-subtle text-text-muted text-xs">
                <th className="text-left px-4 sm:px-5 py-3 font-medium">Modelo</th>
                <th className="text-left px-3 py-3 font-medium">Provider</th>
                <th className="text-right px-3 py-3 font-medium">$/img</th>
                <th className="text-right px-3 py-3 font-medium">R$/img</th>
                <th className="text-right px-3 py-3 font-medium">Resolucao</th>
                <th className="text-center px-3 py-3 font-medium">Refs</th>
                <th className="text-left px-4 sm:px-5 py-3 font-medium">Free</th>
              </tr>
            </thead>
            <tbody>
              {AI_MODELS.map((m) => (
                <tr key={m.id} className="border-b border-border-subtle last:border-b-0 hover:bg-surface-100/50">
                  <td className="px-4 sm:px-5 py-3">
                    <span className="font-medium text-text-primary">{m.name}</span>
                    {m.recommended && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/10 text-yellow-400">Recomendado</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-text-muted capitalize text-xs">{m.provider}</td>
                  <td className="text-right px-3 py-3 text-accent-champagne font-medium">${m.costPerImage.toFixed(3)}</td>
                  <td className="text-right px-3 py-3 text-emerald-400 text-xs font-medium">
                    R$ {(m.costPerImage * usdBrl).toFixed(2)}
                  </td>
                  <td className="text-right px-3 py-3 text-text-muted text-xs">{m.maxResolution}</td>
                  <td className="text-center px-3 py-3">
                    {m.supportsImageInput ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400/50 mx-auto" />
                    )}
                  </td>
                  <td className="px-4 sm:px-5 py-3 text-[11px] text-text-muted">{m.freeTier ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="p-3 sm:p-4 rounded-xl bg-surface-100 border border-border-subtle">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={cn("p-1.5 rounded-lg bg-surface-050", color)}>
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </div>
      </div>
      <p className="text-lg sm:text-xl font-bold text-text-primary">{value}</p>
      <p className="text-[10px] sm:text-[11px] text-text-muted mt-0.5">{label}</p>
    </div>
  );
}

