"use client";


import { BadgeDollarSign, CheckCircle2, DollarSign } from "lucide-react";

interface KpiCardsProps {
  completedCount: number;
  estimatedCostEUR: number;
  costPerCreativeEUR: number;
}

const formatCurrency = (value: number) => `€ ${value.toFixed(2).replace(".", ",")}`;

export function KpiCards({ completedCount, estimatedCostEUR, costPerCreativeEUR }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="theme-panel p-5 rounded-[22px]">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-xl bg-champagne-alpha-10 text-accent-champagne shadow-[var(--shadow-accent-glow)]">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <p className="text-xs text-text-muted">Últimos 30 dias</p>
        </div>
        <p className="text-2xl font-bold text-text-primary">{completedCount}</p>
        <p className="text-xs text-text-muted">Criativos com sucesso</p>
      </div>

      <div className="theme-panel p-5 rounded-[22px]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-champagne-alpha-10 text-accent-champagne shadow-[var(--shadow-accent-glow)]">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-text-primary">{formatCurrency(estimatedCostEUR)}</p>
            <p className="text-xs text-text-muted">Custo estimado • últimos 30 dias</p>
          </div>
        </div>
      </div>

      <div className="theme-panel p-5 rounded-[22px]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-champagne-alpha-10 text-accent-champagne shadow-[var(--shadow-accent-glow)]">
            <BadgeDollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-text-primary">{formatCurrency(costPerCreativeEUR)}</p>
            <p className="text-xs text-text-muted">Custo médio por criativo • últimos 30 dias</p>
          </div>
        </div>
      </div>
    </div>
  );
}

