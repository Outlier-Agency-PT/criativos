"use client";


import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProjectHistoryList } from "@/components/criar/project-history-list";
import { WizardShellSkeleton } from "@/components/criar/wizard-shell";
import { useOrgId } from "@/components/criar/use-org-id";

/**
 * /criar — lista de projetos (histórico) + botão "Novo criativo".
 *
 * Rotas relacionadas:
 *  - /criar/novo          → wizard pra projeto novo (escolha Template vs Briefing)
 *  - /criar/[projectId]   → abre/edita um projeto existente (deep-link bookmarkável)
 *
 * Backward compat: links antigos com ?regenerate=ID, ?new=true e ?briefing=true
 * são redirecionados pras novas rotas.
 */
export default function CriarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orgId, loading } = useOrgId();

  // Backward compat — redireciona query params legados pras rotas novas.
  const legacyRegenerate = searchParams.get("regenerate");
  const legacyNew = searchParams.get("new") === "true";
  const legacyBriefing = searchParams.get("briefing") === "true";
  const hasLegacyParam = Boolean(legacyRegenerate) || legacyNew || legacyBriefing;

  useEffect(() => {
    if (legacyRegenerate) {
      router.replace(`/criar/${legacyRegenerate}`);
    } else if (legacyBriefing) {
      router.replace("/criar/novo?briefing=true");
    } else if (legacyNew) {
      router.replace("/criar/novo");
    }
  }, [legacyRegenerate, legacyNew, legacyBriefing, router]);

  if (loading || hasLegacyParam) {
    return (
      <div className="flex items-center justify-center py-24">
        <WizardShellSkeleton message="Carregando seus projetos..." />
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

  return (
    <ProjectHistoryList
      orgId={orgId}
      onNewCreative={() => router.push("/criar/novo")}
      onOpenProject={(projectId) => router.push(`/criar/${projectId}`)}
    />
  );
}

