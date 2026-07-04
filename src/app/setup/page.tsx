"use client";


import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { User, Camera, Palette, Key, Check, LogOut } from "lucide-react";
import { StepPersona } from "@/components/setup/step-persona";
import { StepPhotos } from "@/components/setup/step-photos";
import { StepBrandKit } from "@/components/setup/step-brand-kit";
import { StepApiKeys } from "@/components/setup/step-api-keys";

const STEPS = [
  { id: 0, label: "Persona", icon: User, required: true },
  { id: 1, label: "Fotos", icon: Camera, required: false },
  { id: 2, label: "Brand Kit", icon: Palette, required: false },
  { id: 3, label: "API Keys", icon: Key, required: true },
];

export default function SetupPage() {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [currentStep, setCurrentStep] = useState(0);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: membership } = await supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!membership) { router.push("/login"); return; }

      setOrgId(membership.org_id);

      // Checar setup_step salvo
      const { data: org } = await supabase
        .from("organizations")
        .select("setup_step, setup_completed")
        .eq("id", membership.org_id)
        .single();

      if (org?.setup_completed) {
        router.push("/dashboard");
        return;
      }

      if (org?.setup_step) {
        setCurrentStep(org.setup_step);
        // Marcar steps anteriores como completos
        const completed = new Set<number>();
        for (let i = 0; i < org.setup_step; i++) completed.add(i);
        setCompletedSteps(completed);
      }

      setLoading(false);
    }
    init();
  }, []);

  async function saveProgress(step: number) {
    if (!orgId) return;
    await supabase
      .from("organizations")
      .update({ setup_step: step })
      .eq("id", orgId);
  }

  function completeStep(step: number) {
    setCompletedSteps((prev) => new Set([...prev, step]));
    const nextStep = step + 1;
    if (nextStep < STEPS.length) {
      setCurrentStep(nextStep);
      saveProgress(nextStep);
    }
  }

  async function finishSetup() {
    if (!orgId) return;
    await supabase
      .from("organizations")
      .update({ setup_completed: true, setup_step: 4 })
      .eq("id", orgId);
    router.push("/dashboard");
  }

  // Finalizar: quando API keys (step 3) completa
  function handleApiKeysComplete() {
    completeStep(3);
    finishSetup();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-000">
        <div className="animate-pulse text-text-muted">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-000 flex flex-col">
      {/* Header */}
      <header className="border-b border-border-subtle">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <img src="/logooutiliercriativos.png" alt="Outlier Criativos" className="h-8" />
            <p className="text-xs text-text-muted">ConfiguraÃ§Ã£o inicial</p>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-surface-100 transition-colors"
            title="Sair desta conta"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </header>

      {/* Stepper */}
      <div className="max-w-2xl mx-auto w-full px-6 py-6">
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((step, i) => {
            const isActive = currentStep === i;
            const isDone = completedSteps.has(i);
            const StepIcon = step.icon;

            return (
              <div key={step.id} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => { if (isDone || i <= currentStep) setCurrentStep(i); }}
                  className={`flex flex-col items-center gap-1.5 ${isDone || i <= currentStep ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    isDone ? "bg-green-500/20 text-green-400" :
                    isActive ? "bg-accent-champagne/20 text-accent-champagne" :
                    "bg-surface-100 text-text-muted"
                  }`}>
                    {isDone ? <Check className="w-5 h-5" /> : <StepIcon className="w-5 h-5" />}
                  </div>
                  <span className={`text-xs ${isActive ? "text-text-primary font-medium" : "text-text-muted"}`}>
                    {step.label}
                    {step.required && !isDone && <span className="text-accent-champagne ml-0.5">*</span>}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-3 ${isDone ? "bg-green-500/30" : "bg-border-subtle"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="bg-surface-000 rounded-xl border border-border-subtle p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-1">
            {STEPS[currentStep].label}
            {STEPS[currentStep].required && <span className="text-accent-champagne ml-1 text-sm">obrigatÃ³rio</span>}
          </h2>
          <p className="text-sm text-text-muted mb-6">
            {currentStep === 0 && "Responda algumas perguntas para que a IA entenda seu pÃºblico."}
            {currentStep === 1 && "Fotos do expert para usar nos criativos."}
            {currentStep === 2 && "Configure as cores, fontes e logo da sua marca."}
            {currentStep === 3 && "Cadastre suas API keys para gerar criativos."}
          </p>

          {orgId && currentStep === 0 && (
            <StepPersona orgId={orgId} onComplete={() => completeStep(0)} />
          )}
          {orgId && currentStep === 1 && (
            <StepPhotos orgId={orgId} onComplete={() => completeStep(1)} onSkip={() => completeStep(1)} />
          )}
          {orgId && currentStep === 2 && (
            <StepBrandKit orgId={orgId} onComplete={() => completeStep(2)} onSkip={() => completeStep(2)} />
          )}
          {orgId && currentStep === 3 && (
            <StepApiKeys orgId={orgId} onComplete={handleApiKeysComplete} />
          )}
        </div>

        {/* Progress indicator */}
        <div className="mt-4 text-center">
          <span className="text-xs text-text-muted">
            Etapa {currentStep + 1} de {STEPS.length}
          </span>
        </div>
      </div>
    </div>
  );
}

