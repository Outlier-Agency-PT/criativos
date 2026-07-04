"use client";


import { useState } from "react";
import { Loader2, RefreshCw, Check, Edit2 } from "lucide-react";

interface PersonaAnswers {
  target_audience: string;
  audience_problems: string;
  purchase_objections: string;
  deep_desires: string;
  extra_context: string;
}

interface StepPersonaProps {
  orgId: string;
  onComplete: (personaId: string) => void;
}

export function StepPersona({ orgId, onComplete }: StepPersonaProps) {
  const [answers, setAnswers] = useState<PersonaAnswers>({
    target_audience: "",
    audience_problems: "",
    purchase_objections: "",
    deep_desires: "",
    extra_context: "",
  });
  const [generating, setGenerating] = useState(false);
  const [persona, setPersona] = useState<Record<string, unknown> | null>(null);
  const [personaName, setPersonaName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const questions = [
    { key: "target_audience", label: "Quem é seu público principal?", placeholder: "Descreva com suas palavras quem são seus clientes ideais..." },
    { key: "audience_problems", label: "Quais problemas esse público enfrenta?", placeholder: "Liste as principais dores e frustrações..." },
    { key: "purchase_objections", label: "Tem objeções de compra que você já conhece?", placeholder: "O que impede essas pessoas de comprar..." },
    { key: "deep_desires", label: "Qual o desejo profundo do seu público?", placeholder: "O que eles realmente querem alcançar..." },
    { key: "extra_context", label: "Algo mais que queira adicionar? (opcional)", placeholder: "Contexto adicional sobre seu negócio ou público..." },
  ];

  const canGenerate = answers.target_audience.trim() && answers.audience_problems.trim();

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/persona-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, orgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPersona(data.persona);
      setPersonaName((data.persona?.nome_sugerido as string) || "Minha Persona");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar persona");
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove() {
    setSaving(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Usando rota genérica, mas precisamos salvar persona
        }),
      });
      // Salvar persona diretamente via Supabase client
      const saveRes = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          name: personaName,
          target_audience: answers.target_audience,
          audience_problems: answers.audience_problems,
          purchase_objections: answers.purchase_objections,
          deep_desires: answers.deep_desires,
          extra_context: answers.extra_context,
          generated_summary: persona,
          is_default: true,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error);
      onComplete(saveData.persona.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar persona");
    } finally {
      setSaving(false);
    }
  }

  if (persona) {
    return (
      <div className="space-y-6">
        <div className="bg-surface-050 rounded-xl border border-border-subtle p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-text-primary">Persona Gerada</h3>
            <button onClick={() => setPersona(null)} className="text-sm text-text-muted hover:text-text-primary flex items-center gap-1">
              <Edit2 className="w-3.5 h-3.5" /> Editar respostas
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Nome da Persona</label>
            <input value={personaName} onChange={(e) => setPersonaName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne" />
          </div>

          {persona.resumo ? (
            <p className="text-sm text-text-secondary leading-relaxed">{persona.resumo as string}</p>
          ) : null}

          {persona.dores_principais ? (
            <div>
              <h4 className="text-xs font-medium text-text-muted mb-1">Dores Principais</h4>
              <ul className="text-sm text-text-secondary space-y-1">
                {(persona.dores_principais as string[]).map((d, i) => <li key={i}>• {d}</li>)}
              </ul>
            </div>
          ) : null}

          {persona.tom_comunicacao ? (
            <div>
              <h4 className="text-xs font-medium text-text-muted mb-1">Tom de Comunicacao</h4>
              <p className="text-sm text-text-secondary">{persona.tom_comunicacao as string}</p>
            </div>
          ) : null}
        </div>

        {error && <p className="text-sm text-accent-red">{error}</p>}

        <div className="flex gap-3">
          <button onClick={handleApprove} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? "Salvando..." : "Aprovar Persona"}
          </button>
          <button onClick={handleGenerate} disabled={generating} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-200 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
            Regenerar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {questions.map((q) => (
        <div key={q.key}>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            {q.label}
          </label>
          <textarea
            value={answers[q.key as keyof PersonaAnswers]}
            onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
            placeholder={q.placeholder}
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg bg-surface-050 border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-champagne resize-none"
          />
        </div>
      ))}

      {error && <p className="text-sm text-accent-red">{error}</p>}

      <button
        onClick={handleGenerate}
        disabled={!canGenerate || generating}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {generating ? "Gerando persona com IA..." : "Gerar Persona"}
      </button>
    </div>
  );
}

