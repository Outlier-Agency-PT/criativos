"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { WizardShell, WizardShellSkeleton } from "@/components/criar/wizard-shell";
import { useOrgId } from "@/components/criar/use-org-id";

/**
 * /criar/[projectId] — abre/edita um projeto existente (deep-link bookmarkável).
 *
 * Substitui o antigo /criar?regenerate=ID. Como é uma rota própria, navegar pra
 * cá (ou pra outro projeto) remonta a página, garantindo estado limpo do wizard.
 */
export default function CriarProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const { orgId, loading } = useOrgId();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <WizardShellSkeleton message="Carregando o projeto..." />
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
    <WizardShell
      orgId={orgId}
      projectId={projectId}
      onBackToHistory={() => router.push("/criar")}
    />
  );
}
