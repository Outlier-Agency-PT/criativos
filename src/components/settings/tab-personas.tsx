"use client";


import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Star,
  StarOff,
  Users,
  RefreshCw,
  Check,
  Edit2,
} from "lucide-react";

interface PersonaAnswers {
  target_audience: string;
  audience_problems: string;
  purchase_objections: string;
  deep_desires: string;
  extra_context: string;
}

interface Persona {
  id: string;
  name: string;
  target_audience: string;
  audience_problems: string;
  purchase_objections: string;
  deep_desires: string;
  extra_context: string;
  generated_summary: Record<string, unknown> | null;
  is_default: boolean;
  created_at: string;
}

interface TabPersonasProps {
  orgId: string;
}

const questions = [
  { key: "target_audience", label: "Quem e seu publico principal?", placeholder: "Descreva com suas palavras quem sao seus clientes ideais..." },
  { key: "audience_problems", label: "Quais problemas esse publico enfrenta?", placeholder: "Liste as principais dores e frustracoes..." },
  { key: "purchase_objections", label: "Tem objecoes de compra que voce ja conhece?", placeholder: "O que impede essas pessoas de comprar..." },
  { key: "deep_desires", label: "Qual o desejo profundo do seu publico?", placeholder: "O que eles realmente querem alcancar..." },
  { key: "extra_context", label: "Algo mais que queira adicionar? (opcional)", placeholder: "Contexto adicional sobre seu negocio ou publico..." },
];

export function TabPersonas({ orgId }: TabPersonasProps) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Formulario de criacao
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

  const fetchPersonas = useCallback(async () => {
    try {
      const res = await fetch(`/api/personas?orgId=${orgId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPersonas(data.personas || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar personas");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

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

  async function handleSaveNew() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/personas", {
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
          is_default: personas.length === 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Resetar formulario
      setShowCreate(false);
      setPersona(null);
      setPersonaName("");
      setAnswers({ target_audience: "", audience_problems: "", purchase_objections: "", deep_desires: "", extra_context: "" });
      await fetchPersonas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar persona");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/personas?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setDeleteConfirm(null);
      await fetchPersonas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao eliminar");
    }
  }

  async function handleSetDefault(id: string) {
    try {
      // Remover default de todas
      for (const p of personas.filter((p) => p.is_default)) {
        await fetch("/api/personas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: p.id, is_default: false }),
        });
      }
      // Setar nova default
      await fetch("/api/personas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_default: true }),
      });
      await fetchPersonas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao definir padrao");
    }
  }

  const canGenerate = answers.target_audience.trim() && answers.audience_problems.trim();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-text-muted" />
          <span className="text-sm text-text-secondary">{personas.length} persona{personas.length !== 1 ? "s" : ""}</span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90"
        >
          <Plus className="w-4 h-4" />
          Nova Persona
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Formulario de criacao */}
      {showCreate && (
        <div className="bg-surface-050 rounded-xl border border-border-subtle p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">Criar nova persona</h3>

          {!persona ? (
            <>
              {questions.map((q) => (
                <div key={q.key}>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">{q.label}</label>
                  <textarea
                    value={answers[q.key as keyof PersonaAnswers]}
                    onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                    placeholder={q.placeholder}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-champagne resize-none"
                  />
                </div>
              ))}
              <div className="flex gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate || generating}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium disabled:opacity-50"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {generating ? "Gerando..." : "Gerar Persona"}
                </button>
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-200">
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Nome da Persona</label>
                <input
                  value={personaName}
                  onChange={(e) => setPersonaName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
                />
              </div>
              {persona.resumo && <p className="text-sm text-text-secondary leading-relaxed">{persona.resumo as string}</p>}
              {persona.dores_principais && (
                <div>
                  <h4 className="text-xs font-medium text-text-muted mb-1">Dores Principais</h4>
                  <ul className="text-sm text-text-secondary space-y-1">
                    {(persona.dores_principais as string[]).map((d, i) => <li key={i}>- {d}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleSaveNew}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? "Salvando..." : "Salvar Persona"}
                </button>
                <button
                  onClick={() => { setPersona(null); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-200"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-200"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} /> Regenerar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Lista de personas */}
      {personas.length === 0 && !showCreate ? (
        <div className="text-center py-12 text-text-muted text-sm">
          Nenhuma persona cadastrada. Clique em &quot;Nova Persona&quot; para comecar.
        </div>
      ) : (
        <div className="space-y-3">
          {personas.map((p) => (
            <div key={p.id} className="bg-surface-050 rounded-xl border border-border-subtle p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-text-primary truncate">{p.name}</h3>
                  {p.is_default && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-champagne/10 text-accent-champagne text-[10px] font-medium">
                      <Star className="w-3 h-3" /> Padrao
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted truncate">{p.target_audience}</p>
                <p className="text-[10px] text-text-muted mt-1">
                  Criada em {new Date(p.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!p.is_default && (
                  <button
                    onClick={() => handleSetDefault(p.id)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-accent-champagne hover:bg-surface-100 transition-colors"
                    title="Marcar como padrao"
                  >
                    <StarOff className="w-4 h-4" />
                  </button>
                )}
                {deleteConfirm === p.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="px-2 py-1 rounded text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1 rounded text-xs text-text-muted hover:bg-surface-100"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(p.id)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

