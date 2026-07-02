"use client";


import { useState, useRef } from "react";
import { X, Loader2, Upload, CheckSquare, Square, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalyzedCopy {
  headline: string;
  mini_copy: string;
  list_items: string;
  cta: string;
  body: string;
}

interface Campaign {
  id: string;
  name: string;
}

interface ImportFileModalProps {
  orgId: string;
  campaigns: Campaign[];
  onClose: () => void;
  onImported: (count: number) => void;
}

export function ImportFileModal({ orgId, campaigns, onClose, onImported }: ImportFileModalProps) {
  const [copies, setCopies] = useState<AnalyzedCopy[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [campaignId, setCampaignId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(file: File) {
    setAnalyzing(true);
    setError(null);
    setFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("orgId", orgId);

      // Use AI analysis endpoint
      const res = await fetch("/api/copy-library/analyze-file", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCopies(data.copies || []);
      setSelected(new Set((data.copies || []).map((_: AnalyzedCopy, i: number) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao analisar ficheiro");
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleCopy(index: number) {
    const next = new Set(selected);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === copies.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(copies.map((_, i) => i)));
    }
  }

  async function handleImport() {
    const selectedCopies = copies.filter((_, i) => selected.has(i));
    if (selectedCopies.length === 0) return;

    setImporting(true);
    setError(null);

    let imported = 0;
    let errors = 0;

    for (const copy of selectedCopies) {
      try {
        const res = await fetch("/api/copy-library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgId,
            headline: copy.headline || null,
            mini_copy: copy.mini_copy || null,
            list_items: copy.list_items || null,
            cta: copy.cta || null,
            body: copy.body || null,
            source: "upload",
            campaign_id: campaignId || null,
          }),
        });
        if (res.ok) imported++;
        else errors++;
      } catch {
        errors++;
      }
    }

    setImporting(false);

    if (imported > 0) {
      onImported(imported);
    } else {
      setError("Nenhuma copy foi importada.");
    }
  }

  const listItems = (items: string) =>
    items ? items.split("\n").filter((l) => l.trim()) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-100 rounded-2xl border border-border-subtle w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text-primary">Importar Copies</h2>
            {fileName && (
              <span className="text-[10px] text-text-muted px-2 py-0.5 rounded bg-surface-200">
                {fileName}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface-200 rounded-lg">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {copies.length === 0 ? (
            <>
              {/* File upload area */}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={analyzing}
                className="w-full py-12 border-2 border-dashed border-border-subtle rounded-xl hover:border-accent-champagne flex flex-col items-center gap-2 transition-all"
              >
                {analyzing ? (
                  <>
                    <Sparkles className="w-6 h-6 animate-pulse text-accent-champagne" />
                    <p className="text-sm text-text-secondary">Analisando com IA...</p>
                    <p className="text-xs text-text-muted">Extraindo copies do ficheiro</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-text-muted" />
                    <p className="text-sm text-text-secondary">Selecione um ficheiro .txt ou .md</p>
                    <p className="text-xs text-text-muted">A IA vai extrair todas as copies automaticamente</p>
                  </>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </>
          ) : (
            <>
              {/* Campanha */}
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

              {/* Select all */}
              <div className="flex items-center justify-between">
                <button onClick={toggleAll} className="text-xs text-accent-champagne hover:underline">
                  {selected.size === copies.length ? "Desselecionar todos" : "Selecionar todos"}
                </button>
                <span className="text-xs text-text-muted">
                  {copies.length} cop{copies.length !== 1 ? "ies" : "y"} encontrada{copies.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Copies list - structured preview */}
              <div className="space-y-2">
                {copies.map((copy, i) => (
                  <button
                    key={i}
                    onClick={() => toggleCopy(i)}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border transition-all flex gap-3",
                      selected.has(i)
                        ? "border-accent-champagne bg-champagne-alpha-05"
                        : "border-border-subtle bg-surface-050"
                    )}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {selected.has(i) ? (
                        <CheckSquare className="w-4 h-4 text-accent-champagne" />
                      ) : (
                        <Square className="w-4 h-4 text-text-muted" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Headline */}
                      {copy.headline && (
                        <p className="text-sm font-medium text-text-primary line-clamp-2">
                          {copy.headline}
                        </p>
                      )}
                      {/* Mini copy */}
                      {copy.mini_copy && (
                        <p className="text-xs text-text-secondary line-clamp-2">
                          {copy.mini_copy}
                        </p>
                      )}
                      {/* List items */}
                      {copy.list_items && listItems(copy.list_items).length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {listItems(copy.list_items).slice(0, 3).map((item, j) => (
                            <span key={j} className="text-[11px] text-text-muted flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-accent-champagne/60 flex-shrink-0" />
                              <span className="line-clamp-1">{item}</span>
                            </span>
                          ))}
                          {listItems(copy.list_items).length > 3 && (
                            <span className="text-[10px] text-text-muted">+{listItems(copy.list_items).length - 3}</span>
                          )}
                        </div>
                      )}
                      {/* CTA + meta */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {copy.cta && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-accent-champagne/20 text-accent-champagne font-medium">
                            {copy.cta}
                          </span>
                        )}
                        {copy.body && (
                          <span className="text-[10px] text-text-muted italic line-clamp-1">
                            {copy.body.slice(0, 60)}{copy.body.length > 60 ? "..." : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {error && <p className="text-xs text-accent-red">{error}</p>}
        </div>

        {/* Footer */}
        {copies.length > 0 && (
          <div className="p-4 border-t border-border-subtle flex justify-end gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-200"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-champagne text-surface-900 disabled:opacity-50"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                `Importar selecionadas (${selected.size})`
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

