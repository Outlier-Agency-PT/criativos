"use client";


import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Key,
  Check,
  X,
  Play,
  Ban,
  Power,
  Star,
  Info,
  Pencil,
} from "lucide-react";
import { AI_MODELS, TEXT_MODELS, getDefaultModel, getDefaultTextModel, isImagenModel, isGemini3ImageModel, REQUIRE_GEMINI3_FOR_IMAGE } from "@/lib/models";

// Providers de TEXTO (copy) — pra esses, o modelo vem de TEXT_MODELS, não de AI_MODELS.
const TEXT_PROVIDERS = ["anthropic", "openai"];

interface ApiKeyItem {
  id: string;
  provider: string;
  model: string;
  label: string;
  priority: number;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  masked_key: string;
}

interface TabApiKeysProps {
  orgId: string;
}

export function TabApiKeys({ orgId }: TabApiKeysProps) {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, "ok" | "error">>({});

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editModel, setEditModel] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editPriority, setEditPriority] = useState(0);
  const [editNewKey, setEditNewKey] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Create form
  const [newKey, setNewKey] = useState("");
  const [newProvider, setNewProvider] = useState("gemini");
  const [newModel, setNewModel] = useState(getDefaultModel().id);
  const [newLabel, setNewLabel] = useState("");
  const [newPriority, setNewPriority] = useState(0);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch(`/api/api-keys?orgId=${orgId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setKeys(data.apiKeys || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar keys");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function handleTestNew() {
    if (!newKey.trim()) return;
    setTesting(true);
    setTestOk(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newKey, provider: newProvider, model: newModel }),
      });
      const data = await res.json();
      setTestOk(data.ok);
    } catch {
      setTestOk(false);
    } finally {
      setTesting(false);
    }
  }

  async function handleTestExisting(id: string) {
    setTestingId(id);
    try {
      const res = await fetch("/api/api-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, orgId }),
      });
      const data = await res.json();
      setTestResult((prev) => ({ ...prev, [id]: data.ok ? "ok" : "error" }));
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: "error" }));
    } finally {
      setTestingId(null);
    }
  }

  async function handleSaveNew() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newKey,
          provider: newProvider,
          model: newModel,
          label: newLabel || `${AI_MODELS.find((m) => m.id === newModel)?.name ?? newModel}`,
          priority: newPriority,
          orgId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowCreate(false);
      setNewKey("");
      setNewProvider("gemini");
      setNewModel(getDefaultModel().id);
      setNewLabel("");
      setNewPriority(0);
      setTestOk(null);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar key");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(id: string, currentActive: boolean) {
    try {
      const res = await fetch("/api/api-keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, orgId, is_active: !currentActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar key");
    }
  }

  function startEdit(k: ApiKeyItem) {
    setEditingId(k.id);
    setEditModel(k.model);
    setEditLabel(k.label);
    setEditPriority(k.priority);
    setEditNewKey("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditNewKey("");
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setEditSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          orgId,
          model: editModel,
          label: editLabel,
          priority: editPriority,
          ...(editNewKey.trim() ? { newKey: editNewKey.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditingId(null);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar key");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/api-keys?id=${id}&orgId=${orgId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setDeleteConfirm(null);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir key");
    }
  }

  function statusIcon(keyItem: ApiKeyItem) {
    const result = testResult[keyItem.id];
    if (testingId === keyItem.id) return <Loader2 className="w-4 h-4 animate-spin text-text-muted" />;
    if (result === "ok") return <Check className="w-4 h-4 text-green-400" />;
    if (result === "error") return <X className="w-4 h-4 text-red-400" />;
    if (keyItem.is_active) return <Check className="w-4 h-4 text-green-400/50" />;
    return <Ban className="w-4 h-4 text-red-400/50" />;
  }

  function getModelName(modelId: string): string {
    return (
      AI_MODELS.find((m) => m.id === modelId)?.name ??
      TEXT_MODELS.find((m) => m.id === modelId)?.name ??
      modelId
    );
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-text-muted" />
          <span className="text-sm text-text-secondary">{keys.length} key{keys.length !== 1 ? "s" : ""}</span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90"
        >
          <Plus className="w-4 h-4" />
          Nova Key
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Aviso de bloqueio Gemini 3 (decisão de qualidade) */}
      {REQUIRE_GEMINI3_FOR_IMAGE && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-300">
            <p className="font-medium">Geração travada em Gemini 3.</p>
            <p className="mt-0.5 text-amber-300/80">
              Por decisão de qualidade, a geração de imagem só usa modelos <strong>Gemini 3</strong>
              {" "}(Nano Banana Pro / gemini-3-pro-image-preview ou gemini-3.1-flash-image-preview).
              Keys com outros modelos ficam ignoradas na geração. Cadastre uma key Gemini 3 funcional abaixo.
            </p>
          </div>
        </div>
      )}

      {/* Modal criacao */}
      {showCreate && (
        <div className="bg-surface-050 rounded-xl border border-border-subtle p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">Adicionar nova API Key</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Provider</label>
              <select
                value={newProvider}
                onChange={(e) => {
                  const p = e.target.value;
                  setNewProvider(p);
                  setTestOk(null);
                  // Ao trocar entre família de imagem e de texto, ajusta o modelo default.
                  if (TEXT_PROVIDERS.includes(p)) {
                    const def = TEXT_MODELS.find((m) => m.provider === p) ?? getDefaultTextModel();
                    setNewModel(def.id);
                  } else {
                    setNewModel(getDefaultModel().id);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
              >
                <optgroup label="Imagem (criativo)">
                  <option value="wisgate">WisGate (mais barato)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openrouter">OpenRouter</option>
                </optgroup>
                <optgroup label="Texto (copy)">
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Prioridade</label>
              <input
                type="number"
                value={newPriority}
                onChange={(e) => setNewPriority(Number(e.target.value))}
                min={0}
                className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Label (opcional)</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Ex: Conta principal"
              className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
            />
          </div>

          {/* Seletor de modelo de TEXTO (quando provider é Anthropic/OpenAI) */}
          {TEXT_PROVIDERS.includes(newProvider) ? (
            <div>
              <label className="block text-xs font-medium text-text-muted mb-2">Modelo de texto (copy)</label>
              <div className="space-y-2">
                {TEXT_MODELS.filter((m) => m.provider === newProvider).map((m) => (
                  <label
                    key={m.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      newModel === m.id
                        ? "border-accent-champagne bg-accent-champagne/5"
                        : "border-border-subtle bg-surface-100 hover:border-border-subtle/80"
                    }`}
                  >
                    <input
                      type="radio"
                      name="textModel"
                      value={m.id}
                      checked={newModel === m.id}
                      onChange={(e) => setNewModel(e.target.value)}
                      className="mt-1 accent-accent-champagne"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {m.recommended && <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />}
                        <span className="text-sm font-semibold text-text-primary">{m.name}</span>
                        <span className="text-xs text-accent-champagne font-medium">~${m.costPer1MOut.toFixed(2)}/1M tok</span>
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        <span className="font-mono">{m.id}</span>
                      </div>
                      <p className="text-xs text-text-muted/70 mt-0.5">{m.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-xs text-text-muted/70 mt-2">
                A ordem de uso da copy (primário e fallback) é definida em <strong>Modelo de texto</strong>, na aba de configurações.
              </p>
            </div>
          ) : (
          /* EP08 S08.2: Seletor de modelo de imagem. Com o bloqueio, só Gemini 3 é selecionável. */
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">Modelo de IA</label>
            <div className="space-y-2">
              {AI_MODELS.map((m) => {
                const blocked = REQUIRE_GEMINI3_FOR_IMAGE && !isGemini3ImageModel(m.id);
                return (
                <label
                  key={m.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    blocked
                      ? "border-border-subtle bg-surface-100/40 opacity-50 cursor-not-allowed"
                      : newModel === m.id
                      ? "border-accent-champagne bg-accent-champagne/5 cursor-pointer"
                      : "border-border-subtle bg-surface-100 hover:border-border-subtle/80 cursor-pointer"
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={m.id}
                    checked={newModel === m.id}
                    disabled={blocked}
                    onChange={(e) => setNewModel(e.target.value)}
                    className="mt-1 accent-accent-champagne"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {m.recommended && <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />}
                      <span className="text-sm font-semibold text-text-primary">{m.name}</span>
                      <span className="text-xs text-accent-champagne font-medium">~${m.costPerImage.toFixed(3)}/img</span>
                      {blocked && <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/15 text-red-400">bloqueado</span>}
                      {isGemini3ImageModel(m.id) && <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/15 text-green-400">Gemini 3</span>}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      <span className="font-mono">{m.id}</span>
                      <span className="mx-1.5">•</span>
                      <span>{m.maxResolution}</span>
                      {m.freeTier && (
                        <>
                          <span className="mx-1.5">•</span>
                          <span className="text-green-400">{m.freeTier}</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-text-muted/70 mt-0.5">{m.description}</p>
                  </div>
                </label>
                );
              })}

              {/* Opção de TEXTO: Gemini 2.5 Flash via este provider (gera copy, não imagem).
                  Disponível em Gemini direto, WisGate e OpenRouter. */}
              {TEXT_MODELS.filter((tm) => tm.provider === "gemini").map((tm) => (
                <label
                  key={tm.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    newModel === tm.id
                      ? "border-accent-champagne bg-accent-champagne/5"
                      : "border-border-subtle bg-surface-100 hover:border-border-subtle/80"
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={tm.id}
                    checked={newModel === tm.id}
                    onChange={(e) => setNewModel(e.target.value)}
                    className="mt-1 accent-accent-champagne"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">{tm.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/15 text-blue-400">texto / copy</span>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      <span className="font-mono">{tm.id}</span>
                    </div>
                    <p className="text-xs text-text-muted/70 mt-0.5">
                      Usa esta key só pra gerar a copy (não entra na geração de imagem). Ative na aba Modelo de texto.
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {/* Aviso Imagen 4 */}
            {isImagenModel(newModel) && (
              <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-300">
                  <p className="font-medium">Imagen 4 gera imagens apenas a partir de texto.</p>
                  <p className="mt-0.5 text-amber-300/70">
                    Templates, fotos e logo não serão usados como referência visual.
                    Para composição com referências, use Nano Banana 2 ou Gemini 2.5 Flash.
                  </p>
                </div>
              </div>
            )}
          </div>
          )}

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={newKey}
                onChange={(e) => { setNewKey(e.target.value); setTestOk(null); }}
                placeholder={
                  newProvider === "gemini" ? "AIzaSy..."
                  : newProvider === "anthropic" ? "sk-ant-..."
                  : newProvider === "openai" ? "sk-..."
                  : newProvider === "wisgate" ? "sk-..."
                  : "sk-or-..."
                }
                className="flex-1 px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm font-mono focus:outline-none focus:border-accent-champagne"
              />
              <button
                onClick={handleTestNew}
                disabled={!newKey.trim() || testing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-100 text-text-secondary text-xs hover:bg-surface-200 disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Testar
              </button>
            </div>
            {testOk === true && <p className="text-xs text-green-400 mt-1">Conexão OK</p>}
            {testOk === false && <p className="text-xs text-red-400 mt-1">Falha na conexão</p>}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSaveNew}
              disabled={!newKey.trim() || saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Salvando..." : "Salvar Key"}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-200">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de keys */}
      {keys.length === 0 && !showCreate ? (
        <div className="text-center py-12 text-text-muted text-sm">
          Nenhuma API key cadastrada. Clique em &quot;Nova Key&quot; para começar.
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <div key={k.id}>
              {/* Modo de edição */}
              {editingId === k.id ? (
                <div className="bg-surface-050 rounded-xl border border-accent-champagne p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-text-primary">Editar API Key</h3>
                    <span className="font-mono text-xs text-text-muted">{k.masked_key}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-text-muted mb-1">Label</label>
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-muted mb-1">Prioridade</label>
                      <input
                        type="number"
                        value={editPriority}
                        onChange={(e) => setEditPriority(Number(e.target.value))}
                        min={0}
                        className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-2">Modelo de IA</label>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {AI_MODELS.map((m) => (
                        <label
                          key={m.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            editModel === m.id
                              ? "border-accent-champagne bg-accent-champagne/5"
                              : "border-border-subtle bg-surface-100 hover:border-border-subtle/80"
                          }`}
                        >
                          <input
                            type="radio"
                            name="editModel"
                            value={m.id}
                            checked={editModel === m.id}
                            onChange={(e) => setEditModel(e.target.value)}
                            className="mt-1 accent-accent-champagne"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {m.recommended && <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />}
                              <span className="text-sm font-semibold text-text-primary">{m.name}</span>
                              <span className="text-xs text-accent-champagne font-medium">~${m.costPerImage.toFixed(3)}/img</span>
                            </div>
                            <div className="text-xs text-text-muted mt-0.5">
                              <span className="font-mono">{m.id}</span>
                              <span className="mx-1.5">•</span>
                              <span>{m.maxResolution}</span>
                              {m.freeTier && (
                                <>
                                  <span className="mx-1.5">•</span>
                                  <span className="text-green-400">{m.freeTier}</span>
                                </>
                              )}
                            </div>
                            <p className="text-xs text-text-muted/70 mt-0.5">{m.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>

                    {isImagenModel(editModel) && (
                      <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-300">
                          <p className="font-medium">Imagen 4 gera imagens apenas a partir de texto.</p>
                          <p className="mt-0.5 text-amber-300/70">
                            Templates, fotos e logo não serão usados como referência visual.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Substituir API Key (opcional)</label>
                    <input
                      type="password"
                      value={editNewKey}
                      onChange={(e) => setEditNewKey(e.target.value)}
                      placeholder="Deixe vazio para manter a key atual"
                      className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm font-mono focus:outline-none focus:border-accent-champagne"
                    />
                    {editNewKey.trim() && (
                      <p className="text-xs text-amber-400 mt-1">A key atual será substituída ao salvar.</p>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveEdit}
                      disabled={editSaving}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium disabled:opacity-50"
                    >
                      {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      {editSaving ? "Salvando..." : "Salvar alterações"}
                    </button>
                    <button onClick={cancelEdit} className="px-4 py-2 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-200">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                /* Modo visualização */
                <div className={`bg-surface-050 rounded-xl border p-4 flex items-center gap-4 ${k.is_active ? "border-border-subtle" : "border-red-500/20 opacity-70"}`}>
                  {/* Status icon */}
                  <div className="flex-shrink-0">
                    {statusIcon(k)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-text-primary">{k.label}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-100 text-text-muted">{k.provider}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent-champagne/10 text-accent-champagne">{getModelName(k.model)}</span>
                      <span className="text-[10px] text-text-muted">#{k.priority}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span className="font-mono">{k.masked_key}</span>
                      {k.last_used_at && (
                        <span>Usado: {new Date(k.last_used_at).toLocaleDateString("pt-BR")}</span>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(k)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-accent-champagne hover:bg-surface-100 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleTestExisting(k.id)}
                      disabled={testingId === k.id}
                      className="p-1.5 rounded-lg text-text-muted hover:text-accent-champagne hover:bg-surface-100 transition-colors"
                      title="Testar"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(k.id, k.is_active)}
                      className={`p-1.5 rounded-lg transition-colors ${k.is_active ? "text-text-muted hover:text-amber-400 hover:bg-amber-400/10" : "text-red-400 hover:text-green-400 hover:bg-green-400/10"}`}
                      title={k.is_active ? "Desativar" : "Ativar"}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    {deleteConfirm === k.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(k.id)}
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
                        onClick={() => setDeleteConfirm(k.id)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
