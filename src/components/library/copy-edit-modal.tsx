"use client";


import { useState } from "react";
import { X, Loader2, Sparkles, CheckSquare, Square, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyData {
  id: string;
  headline: string | null;
  mini_copy: string | null;
  list_items: string | null;
  cta: string | null;
  body: string | null;
  tags: string[];
  campaign_id: string | null;
  product: string | null;
}

interface Campaign {
  id: string;
  name: string;
}

interface AnalyzedCopy {
  headline: string;
  mini_copy: string;
  list_items: string;
  cta: string;
  body: string;
}

function buildRawText(copy: AnalyzedCopy) {
  return [
    copy.headline?.trim(),
    copy.mini_copy?.trim(),
    copy.list_items?.trim(),
    copy.cta?.trim(),
    copy.body?.trim(),
  ]
    .filter(Boolean)
    .join("\n\n") || null;
}

interface CopyEditModalProps {
  copy: CopyData | null;
  campaigns: Campaign[];
  orgId: string;
  initialCampaignId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function CopyEditModal({ copy, campaigns, orgId, initialCampaignId = null, onClose, onSaved }: CopyEditModalProps) {
  const isNew = !copy;

  // Edit mode state (existing copy)
  const [product, setProduct] = useState(copy?.product || "");
  const [headline, setHeadline] = useState(copy?.headline || "");
  const [miniCopy, setMiniCopy] = useState(copy?.mini_copy || "");
  const [listItems, setListItems] = useState(copy?.list_items || "");
  const [cta, setCta] = useState(copy?.cta || "");
  const [body, setBody] = useState(copy?.body || "");
  const [tags, setTags] = useState(copy?.tags?.join(", ") || "");
  const [campaignId, setCampaignId] = useState(copy?.campaign_id || initialCampaignId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paste mode state (new copies)
  const [pastedText, setPastedText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzedCopies, setAnalyzedCopies] = useState<AnalyzedCopy[]>([]);
  const [selectedCopies, setSelectedCopies] = useState<Set<number>>(new Set());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingCopy, setEditingCopy] = useState<AnalyzedCopy | null>(null);
  const [importing, setImporting] = useState(false);

  // --- Paste mode: analyze text ---
  async function handleAnalyze() {
    if (!pastedText.trim()) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/copy-library/analyze-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pastedText, orgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const copies = data.copies || [];
      setAnalyzedCopies(copies);
      setSelectedCopies(new Set(copies.map((_: AnalyzedCopy, i: number) => i)));
      setEditingIndex(null);
      setEditingCopy(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao analisar");
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleAnalyzedCopy(index: number) {
    const next = new Set(selectedCopies);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedCopies(next);
  }

  function toggleAllAnalyzed() {
    if (selectedCopies.size === analyzedCopies.length) {
      setSelectedCopies(new Set());
    } else {
      setSelectedCopies(new Set(analyzedCopies.map((_, i) => i)));
    }
  }

  function startEditingAnalyzed(index: number) {
    setEditingIndex(index);
    setEditingCopy({ ...analyzedCopies[index] });
  }

  function cancelEditingAnalyzed() {
    setEditingIndex(null);
    setEditingCopy(null);
  }

  function updateEditingField(field: keyof AnalyzedCopy, value: string) {
    setEditingCopy((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function saveEditingAnalyzed() {
    if (editingIndex === null || !editingCopy) return;
    setAnalyzedCopies((prev) => prev.map((item, index) => (index === editingIndex ? { ...editingCopy } : item)));
    setEditingIndex(null);
    setEditingCopy(null);
  }

  async function handleImportAnalyzed() {
    const toImport = analyzedCopies.filter((_, i) => selectedCopies.has(i));
    if (toImport.length === 0) return;

    setImporting(true);
    setError(null);
    let imported = 0;
    let lastError: string | null = null;

    for (const c of toImport) {
      try {
        const res = await fetch("/api/copy-library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgId,
            headline: c.headline || null,
            mini_copy: c.mini_copy || null,
            list_items: c.list_items || null,
            cta: c.cta || null,
            body: c.body || null,
            raw_text: buildRawText(c),
            source: "manual",
            campaign_id: campaignId || null,
          }),
        });
        if (res.ok) {
          imported++;
        } else {
          const data = await res.json().catch(() => null);
          lastError = data?.error || "Erro ao salvar copy";
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Erro ao salvar copy";
      }
    }

    setImporting(false);
    if (imported > 0) {
      onSaved();
      onClose();
    } else {
      setError(lastError || "Nenhuma copy foi salva.");
    }
  }

  // --- Edit mode: save single copy ---
  async function handleSave() {
    if (!headline.trim() && !body.trim()) {
      setError("Headline ou body obrigatorio");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        orgId,
        product: product.trim() || null,
        headline: headline.trim() || null,
        mini_copy: miniCopy.trim() || null,
        list_items: listItems.trim() || null,
        cta: cta.trim() || null,
        body: body.trim() || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        campaign_id: campaignId || null,
      };

      const res = await fetch(`/api/copy-library/${copy!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao salvar");
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const listItemsArr = (items: string) =>
    items ? items.split("\n").filter((l) => l.trim()) : [];

  // â”€â”€â”€ NEW COPY: Paste mode â”€â”€â”€
  if (isNew) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-surface-100 rounded-2xl border border-border-subtle w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border-subtle flex-shrink-0">
            <h2 className="text-sm font-semibold text-text-primary">Adicionar Copies</h2>
            <button onClick={onClose} className="p-1 hover:bg-surface-200 rounded-lg">
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {analyzedCopies.length === 0 ? (
              <>
                {/* Paste area */}
                <div className="space-y-1">
                  <label className="text-xs text-text-muted">Cole suas copies aqui</label>
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    rows={12}
                    className="w-full px-3 py-3 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary resize-none leading-relaxed font-mono"
                    placeholder={"Cole aqui suas copies, anuncios ou criativos.\n\nO sistema vai identificar automaticamente:\n- Headlines\n- Mini copy (redline)\n- Lista de topicos\n- CTAs\n- Notas visuais\n\nPode colar 1 ou 50 copies de uma vez."}
                    disabled={analyzing}
                  />
                </div>

                {/* Campaign selector */}
                <div className="space-y-1">
                  <label className="text-xs text-text-muted">Campanha (opcional)</label>
                  <select
                    value={campaignId}
                    onChange={(e) => setCampaignId(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
                  >
                    <option value="">Sem campanha</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {error && <p className="text-xs text-accent-red">{error}</p>}
              </>
            ) : (
              <>
                {/* Results */}
                <div className="flex items-center justify-between">
                  <button onClick={toggleAllAnalyzed} className="text-xs text-accent-champagne hover:underline">
                    {selectedCopies.size === analyzedCopies.length ? "Desselecionar" : "Selecionar todas"}
                  </button>
                  <span className="text-xs text-text-muted">
                    {analyzedCopies.length} cop{analyzedCopies.length !== 1 ? "ies" : "y"} identificada{analyzedCopies.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Campaign selector */}
                <div className="space-y-1">
                  <label className="text-xs text-text-muted">Campanha (opcional)</label>
                  <select
                    value={campaignId}
                    onChange={(e) => setCampaignId(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
                  >
                    <option value="">Sem campanha</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  {analyzedCopies.map((ac, i) => (
                    <div
                      key={i}
                      onClick={() => toggleAnalyzedCopy(i)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleAnalyzedCopy(i);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "w-full text-left p-3 rounded-xl border transition-all flex gap-3",
                        selectedCopies.has(i)
                          ? "border-accent-champagne bg-champagne-alpha-05"
                          : "border-border-subtle bg-surface-050"
                      )}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {selectedCopies.has(i) ? (
                          <CheckSquare className="w-4 h-4 text-accent-champagne" />
                        ) : (
                          <Square className="w-4 h-4 text-text-muted" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            {editingIndex === i && editingCopy ? (
                              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editingCopy.headline}
                                  onChange={(e) => updateEditingField("headline", e.target.value)}
                                  className="w-full px-2.5 py-2 text-sm rounded-lg border border-border-subtle bg-surface-000 text-text-primary"
                                  placeholder="Headline"
                                />
                                <textarea
                                  value={editingCopy.mini_copy}
                                  onChange={(e) => updateEditingField("mini_copy", e.target.value)}
                                  rows={2}
                                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-border-subtle bg-surface-000 text-text-primary resize-none"
                                  placeholder="Mini copy"
                                />
                                <textarea
                                  value={editingCopy.list_items}
                                  onChange={(e) => updateEditingField("list_items", e.target.value)}
                                  rows={3}
                                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-border-subtle bg-surface-000 text-text-primary resize-none"
                                  placeholder="Lista, um item por linha"
                                />
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <input
                                    type="text"
                                    value={editingCopy.cta}
                                    onChange={(e) => updateEditingField("cta", e.target.value)}
                                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-border-subtle bg-surface-000 text-text-primary"
                                    placeholder="CTA"
                                  />
                                  <input
                                    type="text"
                                    value={editingCopy.body}
                                    onChange={(e) => updateEditingField("body", e.target.value)}
                                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-border-subtle bg-surface-000 text-text-primary"
                                    placeholder="Notas visuais"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {ac.headline && (
                                  <p className="text-sm font-medium text-text-primary line-clamp-2">{ac.headline}</p>
                                )}
                                {ac.mini_copy && (
                                  <p className="text-xs text-text-secondary line-clamp-2">{ac.mini_copy}</p>
                                )}
                                {ac.list_items && listItemsArr(ac.list_items).length > 0 && (
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                    {listItemsArr(ac.list_items).slice(0, 3).map((item, j) => (
                                      <span key={j} className="text-[11px] text-text-muted flex items-center gap-1">
                                        <span className="w-1 h-1 rounded-full bg-accent-champagne/60 flex-shrink-0" />
                                        <span className="line-clamp-1">{item}</span>
                                      </span>
                                    ))}
                                    {listItemsArr(ac.list_items).length > 3 && (
                                      <span className="text-[10px] text-text-muted">+{listItemsArr(ac.list_items).length - 3}</span>
                                    )}
                                  </div>
                                )}
                                <div className="flex items-center gap-2 flex-wrap">
                                  {ac.cta && (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-accent-champagne/20 text-accent-champagne font-medium">
                                      {ac.cta}
                                    </span>
                                  )}
                                  {ac.body && (
                                    <span className="text-[10px] text-text-muted italic line-clamp-1">
                                      {ac.body.slice(0, 50)}{ac.body.length > 50 ? "..." : ""}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            {editingIndex === i ? (
                              <>
                                <button
                                  type="button"
                                  onClick={saveEditingAnalyzed}
                                  className="px-2 py-1 text-[10px] rounded-md bg-accent-champagne text-surface-900 font-medium"
                                >
                                  Salvar
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditingAnalyzed}
                                  className="px-2 py-1 text-[10px] rounded-md border border-border-subtle text-text-muted"
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditingAnalyzed(i)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-md border border-border-subtle text-text-muted hover:text-text-primary hover:bg-surface-200"
                              >
                                <Pencil className="w-3 h-3" />
                                Editar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Back button */}
                <button
                  onClick={() => { setAnalyzedCopies([]); setSelectedCopies(new Set()); }}
                  className="text-xs text-text-muted hover:text-text-primary"
                >
                  Voltar e colar outro texto
                </button>

                {error && <p className="text-xs text-accent-red">{error}</p>}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border-subtle flex justify-end gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-200"
            >
              Cancelar
            </button>
            {analyzedCopies.length === 0 ? (
              <button
                onClick={handleAnalyze}
                disabled={analyzing || !pastedText.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent-champagne text-surface-900 disabled:opacity-50"
              >
                {analyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {analyzing ? "Analisando..." : "Extrair copies"}
              </button>
            ) : (
              <button
                onClick={handleImportAnalyzed}
                disabled={importing || selectedCopies.size === 0}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-champagne text-surface-900 disabled:opacity-50"
              >
                {importing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  `Salvar ${selectedCopies.size} cop${selectedCopies.size !== 1 ? "ies" : "y"}`
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // â”€â”€â”€ EDIT COPY: field-by-field form â”€â”€â”€
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-100 rounded-2xl border border-border-subtle w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle flex-shrink-0">
          <h2 className="text-sm font-semibold text-text-primary">Editar Copy</h2>
          <button onClick={onClose} className="p-1 hover:bg-surface-200 rounded-lg">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Produto</label>
            <input
              type="text"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
              placeholder="Nome do produto ou servico"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-text-muted">Headline</label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
              placeholder="Frase principal de impacto"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-text-muted">Mini Copy</label>
            <textarea
              value={miniCopy}
              onChange={(e) => setMiniCopy(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary resize-none"
              placeholder="Texto de apoio"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-text-muted">Lista de topicos</label>
            <textarea
              value={listItems}
              onChange={(e) => setListItems(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary resize-none"
              placeholder={"Um item por linha\nBeneficio 1\nBeneficio 2"}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-text-muted">CTA</label>
            <input
              type="text"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
              placeholder="Call-to-action"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-text-muted">Body / Notas</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary resize-none"
              placeholder="Notas visuais, observacoes"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-text-muted">Tags</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
                placeholder="tag1, tag2"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-muted">Campanha</label>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
              >
                <option value="">Sem campanha</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-accent-red">{error}</p>}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-200"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-champagne text-surface-900 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

