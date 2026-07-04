"use client";


import { useState, useEffect, useRef } from "react";
import { CreatorProvider, useCreator } from "@/components/creator/creator-context";
import { StepSetup } from "@/components/creator/step-setup";
import { StepCopy } from "@/components/creator/step-copy";
import { StepVisual } from "@/components/creator/step-visual";
import { StepReviewGenerate } from "@/components/creator/step-review-generate";
import { StepResult } from "@/components/creator/step-result";
import { cn } from "@/lib/utils";
import {
  LayoutTemplate,
  FileText,
  Zap,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  User,
  ChevronDown,
  CheckCircle2,
  Maximize2,
  ArrowLeft,
  ImageIcon,
  Download,
} from "lucide-react";

const STEPS = [
  { label: "Projeto", icon: LayoutTemplate },
  { label: "Copy", icon: FileText },
  { label: "Visual", icon: ImageIcon },
  { label: "Gerar", icon: Zap },
] as const;

const STEP_COMPONENTS = [StepSetup, StepCopy, StepVisual, StepReviewGenerate];
const RESULT_STEP = 4;

// --- Persona badge ---
interface Persona {
  id: string;
  name: string;
  target_audience: string;
}

function PersonaBadge() {
  const { orgId, personaId, personaName, updateProject } = useCreator();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/personas?orgId=${orgId}`);
        const data = await res.json();
        if (res.ok) {
          const items: Persona[] = data.personas ?? [];
          setPersonas(items);
          // Auto-select first persona if none selected
          if (!personaId && items.length > 0) {
            updateProject({ personaId: items[0].id, personaName: items[0].name });
          }
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-100 text-text-muted text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        Carregando persona...
      </div>
    );
  }

  if (personas.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-100 text-text-muted text-xs">
        <User className="w-3.5 h-3.5" />
        Nenhuma persona
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-150 text-sm transition-colors"
      >
        <User className="w-3.5 h-3.5 text-accent-champagne" />
        <span className="text-text-primary font-medium text-xs">
          {typeof personaName === "string" ? personaName : "Selecionar persona"}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="theme-panel absolute right-0 top-full mt-1 z-50 w-64 rounded-xl shadow-lg">
            {personas.map((p) => {
              const isActive = personaId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    updateProject({ personaId: p.id, personaName: p.name });
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                    isActive
                      ? "bg-champagne-alpha-10 text-accent-champagne"
                      : "hover:bg-surface-100 text-text-secondary"
                  )}
                >
                  {isActive ? (
                    <CheckCircle2 className="w-4 h-4 text-accent-champagne flex-shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-border-subtle flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {p.target_audience && (
                      <p className="text-[10px] text-text-muted truncate">{p.target_audience}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// --- Safe primitive extraction â€” prevents {family, weight} objects from leaking into JSX ---
function safeNum(v: unknown, fallback: number): number {
  return typeof v === "number" && isFinite(v) ? v : fallback;
}
function safeStr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function WizardNavigation({
  currentStep,
  canGoBack,
  canGoNext,
  onBack,
  onNext,
  compact = false,
}: {
  currentStep: number;
  canGoBack: boolean;
  canGoNext: boolean;
  onBack: () => void;
  onNext: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "theme-panel-strong flex items-center justify-between rounded-[22px] px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.36)]",
        compact && "rounded-[18px] px-3 py-2.5"
      )}
    >
      <button
        onClick={onBack}
        disabled={!canGoBack}
        className={cn(
          "flex items-center gap-2 rounded-lg bg-surface-100 text-text-secondary font-medium hover:bg-surface-150 disabled:opacity-30 disabled:cursor-not-allowed",
          compact ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm"
        )}
      >
        <ChevronLeft className="w-4 h-4" />
        Voltar
      </button>

      {currentStep < STEPS.length - 1 && (
        <button
          onClick={onNext}
          disabled={!canGoNext}
          className={cn(
            "flex items-center gap-2 rounded-lg bg-accent-champagne text-surface-000 font-semibold hover:bg-accent-champagne/90 disabled:opacity-50 disabled:cursor-not-allowed",
            compact ? "px-4 py-2 text-xs" : "px-5 py-2.5 text-sm"
          )}
        >
          Proximo
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function WizardShellSkeleton({ message }: { message: string }) {
  return (
    <div className="w-full space-y-6 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="h-8 w-28 rounded-xl bg-surface-100/80" />
          <div className="h-8 w-56 rounded-xl bg-surface-100/80" />
          <div className="h-4 w-72 rounded-lg bg-surface-100/60" />
        </div>
        <div className="h-9 w-40 rounded-xl bg-surface-100/70" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="h-11 rounded-xl bg-surface-100/70" />
        <div className="h-11 rounded-xl bg-surface-100/60" />
        <div className="h-11 rounded-xl bg-surface-100/60" />
      </div>

      <div className="theme-panel-strong rounded-[26px] p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="h-6 w-36 rounded-lg bg-surface-100/80" />
          <div className="h-8 w-28 rounded-xl bg-surface-100/60" />
        </div>

        <div className="space-y-4">
          <div className="h-24 rounded-[20px] bg-surface-100/55" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="h-40 rounded-[20px] bg-surface-100/50" />
            <div className="h-40 rounded-[20px] bg-surface-100/45" />
          </div>
          <div className="h-56 rounded-[22px] bg-surface-100/40" />
        </div>
      </div>

      <div className="theme-panel-strong rounded-[22px] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="h-10 w-28 rounded-xl bg-surface-100/70" />
          <div className="h-10 w-32 rounded-xl bg-surface-100/85" />
        </div>
      </div>

      <p className="text-sm text-text-muted">{message}</p>
    </div>
  );
}

// --- Main creator content (wizard) ---
function CreatorContent({ onBackToHistory }: { onBackToHistory: () => void }) {
  const {
    currentStep,
    projectId,
    sourceProjectId,
    projectName,
    setStep,
    selectedTemplates,
    copies,
    brandKitId,
    brandKitName,
    format,
    selectedFormats,
    draftLoading,
    reset,
    loadedCreatives,
  } =
    useCreator();
  const footerNavRef = useRef<HTMLDivElement | null>(null);
  const [showFloatingNav, setShowFloatingNav] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  async function handleDownloadZip() {
    if (!projectId || downloadingZip) return;
    setDownloadingZip(true);
    try {
      const res = await fetch(`/api/generate/download?projectId=${projectId}`);
      if (!res.ok) throw new Error("Falha no download");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (projectName || "criativos").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 60);
      a.download = `criativos-${safeName || projectId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silencioso
    } finally {
      setDownloadingZip(false);
    }
  }

  // Extract safe primitives from format â€” NEVER render format fields directly
  const formatWidth = safeNum(format?.width, 1080);
  const formatHeight = safeNum(format?.height, 1350);
  const formatLabel = safeStr(format?.label, "Feed");
  const isRestoredProject = Boolean(projectId || sourceProjectId);
  const hasRestoredOutput = loadedCreatives.length > 0;

  function canAdvance(): boolean {
    const hasFormat = (selectedFormats?.length ?? 0) > 0;
    switch (currentStep) {
      case 0:
        return (selectedTemplates.length > 0 && hasFormat) || (isRestoredProject && (copies.length > 0 || hasRestoredOutput));
      case 1:
        // Step Copy: precisa ter copy + (template do step anterior implica visual no proximo)
        return (copies.length > 0) || (isRestoredProject && copies.length > 0);
      case 2:
        // Step Visual: brand kit obrigatorio (logo/fotos sao opcionais)
        return (!!brandKitId || !!brandKitName) || isRestoredProject;
      case 3:
        return false; // Has generate button
      default:
        return false;
    }
  }

  function handleBack() {
    if (currentStep > 0) setStep(currentStep - 1);
  }

  function handleNext() {
    if (canAdvance() && currentStep < STEPS.length - 1) {
      setStep(currentStep + 1);
    }
  }

  useEffect(() => {
    if (currentStep >= RESULT_STEP) return;

    const node = footerNavRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFloatingNav(!entry.isIntersecting);
      },
      { threshold: 0.15 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [currentStep]);

  if (draftLoading) {
    return (
      <WizardShellSkeleton message="Carregando o wizard..." />
    );
  }

  // Result (hidden step outside the visible stepper)
  if (currentStep === RESULT_STEP) {
    return <StepResult />;
  }

  const StepComponent = STEP_COMPONENTS[currentStep];

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <button
            onClick={onBackToHistory}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-100 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-text-primary">
              <span>{projectName?.trim() || "Criar Criativos"}</span>
              {projectId && (
                <span className="font-mono text-xs font-normal text-text-muted">
                  #{projectId.slice(0, 8)}
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {projectName?.trim() ? "Projeto carregado" : "Configure seu projeto passo a passo"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PersonaBadge />
          {loadedCreatives && loadedCreatives.length > 0 && currentStep < RESULT_STEP && (
            <button
              onClick={() => setStep(RESULT_STEP)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-accent-champagne hover:bg-champagne-alpha-10 transition-colors"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Ver anteriores ({loadedCreatives.length})
            </button>
          )}
          {currentStep > 0 && (
            <button
              onClick={() => {
                if (confirm("Descartar progresso e comecar do zero?")) reset();
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-text-muted hover:text-accent-red hover:bg-accent-red-dim transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Recomecar
            </button>
          )}
        </div>
      </div>

      {/* Stepper - 4 steps */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((step, i) => {
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          const isNext = i === currentStep + 1;
          const isNextAvailable = isNext && canAdvance();
          const isClickable = i <= currentStep || isNextAvailable;
          const Icon = step.icon;

          return (
            <button
              key={i}
              onClick={() => {
                if (isClickable) setStep(i);
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-1 justify-center border",
                isClickable ? "cursor-pointer" : "cursor-not-allowed",
                isActive
                  ? "border-accent-champagne bg-accent-champagne text-surface-000 shadow-[var(--shadow-accent-glow)]"
                  : isDone
                    ? "border-accent-champagne/30 bg-champagne-alpha-10 text-accent-champagne hover:border-accent-champagne/50"
                    : isNextAvailable
                      ? "border-border-default bg-surface-000 text-text-secondary hover:border-accent-champagne/40 hover:bg-surface-100"
                      : "border-border-subtle bg-surface-050 text-text-muted/80"
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{step.label}</span>
              {isDone && <CheckCircle2 className="w-3.5 h-3.5" />}
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div className="theme-panel rounded-[26px] p-6 min-h-[400px]">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-text-primary">
            {STEPS[currentStep]?.label}
          </h2>
          <div className="flex items-center gap-2">
            {projectId && loadedCreatives.length > 0 && (
              <button
                onClick={handleDownloadZip}
                disabled={downloadingZip}
                className="flex items-center gap-1.5 rounded-xl bg-accent-champagne px-3 py-1.5 text-xs font-semibold text-surface-000 hover:bg-accent-champagne/90 disabled:opacity-50 transition-colors"
                title="Baixar todas as imagens em ZIP"
              >
                {downloadingZip ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Download ZIP ({loadedCreatives.length})
              </button>
            )}
            {/* Formato/tamanho sempre visivel no topo */}
            <div className="theme-panel rounded-xl px-3 py-1.5 text-xs text-text-muted">
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="font-medium text-text-secondary">{formatLabel}</span>
              <span>({formatWidth}x{formatHeight})</span>
            </div>
          </div>
        </div>
        {StepComponent && <StepComponent />}
      </div>

      {currentStep < RESULT_STEP && showFloatingNav && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 px-4 md:left-[calc(var(--app-sidebar-width,16rem)+1.75rem)] md:right-6 md:px-0">
          <div className="mx-auto max-w-6xl pointer-events-auto">
            <WizardNavigation
              currentStep={currentStep}
              canGoBack={currentStep > 0}
              canGoNext={canAdvance()}
              onBack={handleBack}
              onNext={handleNext}
              compact
            />
          </div>
        </div>
      )}

      {currentStep < RESULT_STEP && (
        <div ref={footerNavRef}>
          <WizardNavigation
            currentStep={currentStep}
            canGoBack={currentStep > 0}
            canGoNext={canAdvance()}
            onBack={handleBack}
            onNext={handleNext}
          />
        </div>
      )}
    </div>
  );
}

// --- Wrapper that loads project config into wizard ---
function RegenerateLoader({ projectId, onReady }: { projectId: string; onReady: () => void }) {
  const { loadFromProject } = useCreator();
  const [loadError, setLoadError] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    loadFromProject(projectId).then((ok) => {
      if (!ok) setLoadError(true);
      onReady();
    });
  }, [projectId, loadFromProject, onReady]);

  if (loadError) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-accent-red">Erro ao carregar configuracoes do projeto.</p>
      </div>
    );
  }

  return null;
}

/**
 * Shell reutilizÃ¡vel do wizard de criaÃ§Ã£o.
 *
 * Renderiza o CreatorProvider + wizard, carregando um projeto existente
 * (`projectId`) ou iniciando do zero (`startFresh`).
 *
 * `onBackToHistory` Ã© chamado quando o usuÃ¡rio clica em "Voltar" no header â€”
 * cada rota decide pra onde navegar (normalmente router.push("/criar")).
 */
export function WizardShell({
  orgId,
  projectId,
  startFresh = false,
  onBackToHistory,
}: {
  orgId: string;
  projectId?: string | null;
  startFresh?: boolean;
  onBackToHistory: () => void;
}) {
  const regenerateProjectId = projectId ?? null;
  const [regenerateLoading, setRegenerateLoading] = useState(!!regenerateProjectId);

  return (
    <CreatorProvider
      // key forÃ§a remontar limpo ao trocar de projeto (abrir A, voltar, abrir B)
      // ou ao iniciar um projeto novo, evitando vazar estado do projeto anterior.
      key={regenerateProjectId ?? (startFresh ? "fresh" : "wizard")}
      orgId={orgId}
      startFresh={startFresh}
      skipDraftLoad={Boolean(regenerateProjectId)}
    >
      {regenerateProjectId && regenerateLoading && (
        <RegenerateLoader
          projectId={regenerateProjectId}
          onReady={() => setRegenerateLoading(false)}
        />
      )}
      {regenerateLoading ? (
        <WizardShellSkeleton message="Carregando configuracoes do projeto..." />
      ) : (
        <CreatorContent onBackToHistory={onBackToHistory} />
      )}
    </CreatorProvider>
  );
}

