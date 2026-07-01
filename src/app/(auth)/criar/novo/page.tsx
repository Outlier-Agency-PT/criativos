"use client";


import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BriefingMode } from "@/components/creator/briefing-mode/briefing-mode";
import { WizardShell, WizardShellSkeleton } from "@/components/criar/wizard-shell";
import { useOrgId } from "@/components/criar/use-org-id";
import {
  LayoutTemplate,
  FileText,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";

// Tela de escolha do tipo de criaÃ§Ã£o (Template vs Briefing).
function CreativeModeChooser({
  onBack,
  onTemplate,
  onBriefing,
}: {
  onBack: () => void;
  onTemplate: () => void;
  onBriefing: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Como vocÃª quer criar?</h1>
          <p className="text-sm text-text-muted mt-1">
            Escolha o ponto de partida dos seus criativos.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
        {/* Card: Por Template */}
        <button
          onClick={onTemplate}
          className="theme-panel rounded-[26px] p-6 text-left transition-all hover:border-accent-champagne group flex flex-col gap-4 min-h-[220px]"
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "var(--champagne-alpha-10)", color: "var(--accent-champagne)" }}
          >
            <LayoutTemplate className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary">Por Template</h2>
            <p className="text-sm text-text-muted mt-1.5">
              Escolha um ou mais templates da biblioteca e gere criativos seguindo o layout deles. Ideal pra manter um padrÃ£o visual.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-champagne">
            ComeÃ§ar <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </button>

        {/* Card: Por Briefing */}
        <button
          onClick={onBriefing}
          className="theme-panel rounded-[26px] p-6 text-left transition-all hover:border-accent-champagne group flex flex-col gap-4 min-h-[220px]"
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "var(--champagne-alpha-10)", color: "var(--accent-champagne)" }}
          >
            <FileText className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary">Por Briefing</h2>
            <p className="text-sm text-text-muted mt-1.5">
              Cole um briefing com vÃ¡rios criativos (ideia, copy e direÃ§Ã£o visual). A IA monta os prompts e gera todos em lote, sem template.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-champagne">
            ComeÃ§ar <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * /criar/novo â€” fluxo de criaÃ§Ã£o de um projeto novo.
 *
 * Etapas internas (estado local, mesma rota):
 *  - "choose"   â†’ escolha Template vs Briefing
 *  - "template" â†’ wizard padrÃ£o (WizardShell startFresh)
 *  - "briefing" â†’ modo lote por briefing
 *
 * ?briefing=true pula direto pro modo briefing (backward compat).
 */
type Mode = "choose" | "template" | "briefing";

export default function CriarNovoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orgId, loading } = useOrgId();
  const [mode, setMode] = useState<Mode>(searchParams.get("briefing") === "true" ? "briefing" : "choose");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <WizardShellSkeleton message="Preparando o ambiente de criacao..." />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="text-center py-24">
        <p className="text-sm text-text-muted">
          Organizacao nao encontrada. Complete o setup primeiro.
        </p>
      </div>
    );
  }

  if (mode === "briefing") {
    return <BriefingMode orgId={orgId} onBack={() => router.push("/criar")} />;
  }

  if (mode === "template") {
    return (
      <WizardShell
        orgId={orgId}
        startFresh
        onBackToHistory={() => router.push("/criar")}
      />
    );
  }

  return (
    <CreativeModeChooser
      onBack={() => router.push("/criar")}
      onTemplate={() => setMode("template")}
      onBriefing={() => setMode("briefing")}
    />
  );
}

