"use client";


import { useState, useEffect, useCallback } from "react";
import { Loader2, Check, ChevronUp, ChevronDown, Plus, X, Type, Info, AlertTriangle } from "lucide-react";
import { TEXT_MODELS, DEFAULT_TEXT_MODEL_CHAIN, getTextModelById } from "@/lib/models";

interface TabTextModelProps {
  orgId: string;
}

interface KeyInfo {
  provider: string;
  is_active: boolean;
}

/**
 * Configuração do MODELO DE TEXTO (copy).
 * O usuário monta uma cadeia ordenada: o 1º é o primário; os demais são fallback
 * usados em ordem quando o anterior falha. Default: Haiku → GPT-4o mini → Gemini 2.5 Flash.
 */
export function TabTextModel({ orgId }: TabTextModelProps) {
  const [chain, setChain] = useState<string[]>(DEFAULT_TEXT_MODEL_CHAIN);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cfgRes, keysRes] = await Promise.all([
        fetch(`/api/text-model-config?orgId=${orgId}`),
        fetch(`/api/api-keys?orgId=${orgId}`),
      ]);
      const cfg = await cfgRes.json();
      const keysData = await keysRes.json();
      if (cfgRes.ok && Array.isArray(cfg.modelChain)) setChain(cfg.modelChain);
      if (keysRes.ok) setKeys(keysData.apiKeys || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar configuração");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  // Há key ativa que sabe falar com o provider desse modelo de texto?
  function hasKeyFor(modelId: string): boolean {
    const provider = getTextModelById(modelId)?.provider;
    if (!provider) return false;
    return keys.some((k) => {
      if (!k.is_active) return false;
      if (provider === "anthropic") return k.provider === "anthropic";
      if (provider === "openai") return k.provider === "openai";
      // gemini: key direta ou relay
      return k.provider === "gemini" || k.provider === "wisgate" || k.provider === "openrouter";
    });
  }

  const available = TEXT_MODELS.filter((m) => !chain.includes(m.id));

  function move(index: number, dir: -1 | 1) {
    const next = [...chain];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setChain(next);
    setSaved(false);
  }

  function remove(modelId: string) {
    if (chain.length <= 1) return; // sempre ao menos 1
    setChain(chain.filter((m) => m !== modelId));
    setSaved(false);
  }

  function add(modelId: string) {
    setChain([...chain, modelId]);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/text-model-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, modelChain: chain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2">
        <Type className="w-5 h-5 text-text-muted mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Modelo de texto (copy)</h3>
          <p className="text-xs text-text-muted mt-0.5 max-w-xl">
            Modelo usado pra gerar as copies dos criativos. O primeiro é o principal; os de baixo
            são fallback, usados em ordem quando o anterior falha. A geração de imagem continua no Gemini 3.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Cadeia ordenada */}
      <div className="space-y-2">
        {chain.map((modelId, i) => {
          const m = getTextModelById(modelId);
          const ok = hasKeyFor(modelId);
          return (
            <div
              key={modelId}
              className="flex items-center gap-3 p-3 rounded-xl border border-border-subtle bg-surface-050"
            >
              <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-accent-champagne/10 text-accent-champagne text-xs font-bold flex items-center justify-center">
                {i === 0 ? "1º" : `${i + 1}º`}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">{m?.name ?? modelId}</span>
                  {i === 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent-champagne/15 text-accent-champagne">principal</span>
                  )}
                  {!ok && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400">
                      <AlertTriangle className="w-3 h-3" /> sem key
                    </span>
                  )}
                </div>
                <span className="text-xs text-text-muted font-mono">{modelId}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="p-1.5 rounded-lg text-text-muted hover:text-accent-champagne hover:bg-surface-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Subir"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === chain.length - 1}
                  className="p-1.5 rounded-lg text-text-muted hover:text-accent-champagne hover:bg-surface-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Descer"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => remove(modelId)}
                  disabled={chain.length <= 1}
                  className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Remover"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Adicionar modelos disponíveis */}
      {available.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted mb-2">Adicionar fallback</p>
          <div className="flex flex-wrap gap-2">
            {available.map((m) => (
              <button
                key={m.id}
                onClick={() => add(m.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 text-text-secondary text-xs hover:bg-surface-200"
              >
                <Plus className="w-3.5 h-3.5" />
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 p-3 rounded-lg bg-surface-100/40 border border-border-subtle">
        <Info className="w-4 h-4 text-text-muted flex-shrink-0 mt-0.5" />
        <p className="text-xs text-text-muted">
          Modelos marcados com <span className="text-amber-400">sem key</span> não têm uma API key ativa do provider
          correspondente. Cadastre a key na aba <strong>API Keys</strong> (Anthropic pra Claude, OpenAI pra GPT,
          Gemini/WisGate pra Gemini Flash) ou eles serão pulados.
        </p>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
        {saving ? "Salvando..." : saved ? "Salvo" : "Salvar configuração"}
      </button>
    </div>
  );
}
