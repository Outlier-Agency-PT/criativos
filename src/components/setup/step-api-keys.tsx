"use client";


import { useState } from "react";
import { Loader2, Check, X, Key, ChevronDown, ChevronUp } from "lucide-react";

interface KeyEntry {
  value: string;
  provider: string;
  label: string;
  priority: number;
  status: "idle" | "testing" | "ok" | "error";
}

interface StepApiKeysProps {
  orgId: string;
  onComplete: () => void;
}

export function StepApiKeys({ orgId, onComplete }: StepApiKeysProps) {
  const [keys, setKeys] = useState<KeyEntry[]>([
    { value: "", provider: "gemini", label: "Google Gemini — Conta 1", priority: 0, status: "idle" },
    { value: "", provider: "gemini", label: "Google Gemini — Conta 2", priority: 1, status: "idle" },
    { value: "", provider: "gemini", label: "Google Gemini — Conta 3", priority: 2, status: "idle" },
    { value: "", provider: "openrouter", label: "OpenRouter (fallback)", priority: 3, status: "idle" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState<string | null>(null);

  function updateKey(index: number, value: string) {
    const updated = [...keys];
    updated[index] = { ...updated[index], value, status: "idle" };
    setKeys(updated);
  }

  async function testKey(index: number) {
    const key = keys[index];
    if (!key.value.trim()) return;

    const updated = [...keys];
    updated[index] = { ...updated[index], status: "testing" };
    setKeys(updated);

    try {
      const res = await fetch("/api/api-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.value, provider: key.provider }),
      });
      const data = await res.json();
      updated[index] = { ...updated[index], status: data.ok ? "ok" : "error" };
    } catch {
      updated[index] = { ...updated[index], status: "error" };
    }
    setKeys([...updated]);
  }

  const hasAtLeastOneValid = keys.some((k) => k.status === "ok");
  const filledKeys = keys.filter((k) => k.value.trim());

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      for (const key of filledKeys) {
        const res = await fetch("/api/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: key.value,
            provider: key.provider,
            label: key.label,
            priority: key.priority,
            orgId,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error);
        }
      }
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar keys");
    } finally {
      setSaving(false);
    }
  }

  const statusIcon = (status: KeyEntry["status"]) => {
    switch (status) {
      case "testing": return <Loader2 className="w-4 h-4 animate-spin text-text-muted" />;
      case "ok": return <Check className="w-4 h-4 text-green-400" />;
      case "error": return <X className="w-4 h-4 text-red-400" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-surface-050 rounded-lg p-3 text-xs text-text-muted">
        <strong className="text-text-secondary">Por que 3 contas?</strong> O Gemini tem limite de requisições por conta.
        Com 3 contas + OpenRouter, você nunca para no meio de uma geração.
      </div>

      {/* Gemini Keys */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
          <Key className="w-4 h-4" /> Google Gemini
        </h3>
        {keys.filter((k) => k.provider === "gemini").map((key, i) => (
          <div key={i} className="space-y-1">
            <label className="text-xs text-text-muted">
              {key.label} {i === 0 && <span className="text-accent-champagne">★ obrigatória</span>}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="password"
                  value={key.value}
                  onChange={(e) => updateKey(i, e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 pr-8 rounded-lg bg-surface-050 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne font-mono"
                />
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {statusIcon(key.status)}
                </div>
              </div>
              <button
                onClick={() => testKey(i)}
                disabled={!key.value.trim() || key.status === "testing"}
                className="px-3 py-2 rounded-lg bg-surface-100 text-text-secondary text-xs hover:bg-surface-200 disabled:opacity-50 whitespace-nowrap"
              >
                Testar
              </button>
            </div>
          </div>
        ))}

        <button onClick={() => setShowTutorial(showTutorial === "gemini" ? null : "gemini")} className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1">
          Como obter uma API key do Gemini
          {showTutorial === "gemini" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showTutorial === "gemini" && (
          <div className="bg-surface-050 rounded-lg p-3 text-xs text-text-muted space-y-1">
            <p>1. Acesse <span className="text-text-secondary">aistudio.google.com</span></p>
            <p>2. Clique em "Get API Key"</p>
            <p>3. Crie um novo projeto ou use um existente</p>
            <p>4. Copie a API key gerada</p>
            <p>5. Repita para cada conta Google que tiver</p>
          </div>
        )}
      </div>

      {/* OpenRouter Key */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
          <Key className="w-4 h-4" /> OpenRouter (fallback)
        </h3>
        <div className="space-y-1">
          <label className="text-xs text-text-muted">{keys[3].label} (recomendado)</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="password"
                value={keys[3].value}
                onChange={(e) => updateKey(3, e.target.value)}
                placeholder="sk-or-..."
                className="w-full px-3 py-2 pr-8 rounded-lg bg-surface-050 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne font-mono"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                {statusIcon(keys[3].status)}
              </div>
            </div>
            <button
              onClick={() => testKey(3)}
              disabled={!keys[3].value.trim() || keys[3].status === "testing"}
              className="px-3 py-2 rounded-lg bg-surface-100 text-text-secondary text-xs hover:bg-surface-200 disabled:opacity-50 whitespace-nowrap"
            >
              Testar
            </button>
          </div>
        </div>

        <button onClick={() => setShowTutorial(showTutorial === "openrouter" ? null : "openrouter")} className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1">
          Como obter uma API key do OpenRouter
          {showTutorial === "openrouter" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showTutorial === "openrouter" && (
          <div className="bg-surface-050 rounded-lg p-3 text-xs text-text-muted space-y-1">
            <p>1. Acesse <span className="text-text-secondary">openrouter.ai</span></p>
            <p>2. Crie uma conta ou faça login</p>
            <p>3. Vá em "Keys" no menu</p>
            <p>4. Crie uma nova API key</p>
            <p>5. Adicione créditos (a partir de $5)</p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-accent-red">{error}</p>}

      <button
        onClick={handleSave}
        disabled={!hasAtLeastOneValid || saving}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {saving ? "Salvando..." : `Salvar ${filledKeys.length} key${filledKeys.length !== 1 ? "s" : ""} e finalizar`}
      </button>

      {!hasAtLeastOneValid && filledKeys.length > 0 && (
        <p className="text-xs text-amber-400 text-center">Teste pelo menos 1 key antes de continuar</p>
      )}
    </div>
  );
}

