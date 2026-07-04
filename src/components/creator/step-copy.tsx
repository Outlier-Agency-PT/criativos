"use client";


import { useState, useMemo, useRef } from "react";
import {
  useCreator,
  type CopyItem,
  type CopyElement,
  type CopyPattern,
  COPY_PATTERN_FIELDS,
  defaultActiveFields,
} from "./creator-context";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Edit2,
  Loader2,
  Sparkles,
  FileText,
  Upload,
  X,
  Check,
  BookOpen,
  ClipboardPaste,
} from "lucide-react";
import { CopyLibraryBrowser } from "../library/copy-library-browser";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

interface AiAnalyzedCopy {
  id: string;
  fields: Record<string, string>;
  status: "pending" | "approved" | "editing" | "discarded";
  editFields?: Record<string, string>;
}

export function StepCopy() {
  const {
    copies,
    selectedTemplates,
    personaId,
    orgId,
    updateProject,
    copyPattern,
    activeCopyFields,
  } = useCreator();
  const [mode, setMode] = useState<"manual" | "ai" | "library">("manual");
  // Reorganizando copies da biblioteca com IA pro padrão ativo (loading).
  const [libraryOrganizing, setLibraryOrganizing] = useState(false);

  // BLOCO A — campos visíveis derivam do padrão de copy ativo.
  const patternFields = COPY_PATTERN_FIELDS[copyPattern];

  // BLOCO A — trocar padrão reseta os campos ativos pro default do novo padrão.
  function changeCopyPattern(next: CopyPattern) {
    if (next === copyPattern) return;
    updateProject({ copyPattern: next, activeCopyFields: defaultActiveFields(next) });
  }

  // BLOCO B — liga/desliga um campo (nível projeto). Mantém ao menos 1 marcado.
  function toggleActiveField(key: string) {
    const current = activeCopyFields.length > 0 ? activeCopyFields : defaultActiveFields(copyPattern);
    const isOn = current.includes(key);
    const next = isOn ? current.filter((k) => k !== key) : [...current, key];
    if (next.length === 0) return; // não deixar zerar todos os campos
    updateProject({ activeCopyFields: next });
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});

  // "Ja tem copy" sub-mode: "paste" (textarea) or "file" (upload)
  const [manualSubMode, setManualSubMode] = useState<"paste" | "file">("paste");
  const [pasteText, setPasteText] = useState("");
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteCopies, setPasteCopies] = useState<AiAnalyzedCopy[]>([]);
  const manualFileInputRef = useRef<HTMLInputElement>(null);
  const [manualFileName, setManualFileName] = useState<string | null>(null);
  const [manualFileLoading, setManualFileLoading] = useState(false);
  const [manualFileError, setManualFileError] = useState<string | null>(null);
  const [manualFileCopies, setManualFileCopies] = useState<AiAnalyzedCopy[]>([]);

  // IA fields (template-aware mode EP-02.07)
  const [productName, setProductName] = useState("");
  const [salesArguments, setSalesArguments] = useState("");
  const [aiCount, setAiCount] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [generatedCopies, setGeneratedCopies] = useState<AiAnalyzedCopy[]>([]);
  // Legacy IA fields (fallback when no templates selected)
  const [direction, setDirection] = useState("");
  const [count, setCount] = useState(3);

  // Extrair elementos unicos de todos os templates selecionados
  const allElements = useMemo(() => {
    const map = new Map<string, CopyElement>();
    for (const tmpl of selectedTemplates) {
      if (tmpl.copyElements) {
        for (const el of tmpl.copyElements) {
          if (!map.has(el.key)) map.set(el.key, el);
        }
      }
    }
    if (map.size === 0) {
      // BLOCO A — 4 campos do PADRÃO ativo (Estático ou Mini copy)
      for (const f of COPY_PATTERN_FIELDS[copyPattern]) {
        map.set(f.key, { key: f.key, label: f.label, type: "text" });
      }
    }
    return Array.from(map.values());
  }, [selectedTemplates, copyPattern]);

  // --- Upload file handlers (AI analysis) ---
  function getListSetter(list: "ai" | "paste" | "manual-file") {
    if (list === "ai") return setGeneratedCopies;
    if (list === "paste") return setPasteCopies;
    return setManualFileCopies;
  }

  function getListSource(list: "ai" | "paste" | "manual-file") {
    if (list === "ai") return generatedCopies;
    if (list === "paste") return pasteCopies;
    return manualFileCopies;
  }

  function setAnalyzedStatus(id: string, status: AiAnalyzedCopy["status"], list: "ai" | "paste" | "manual-file" = "paste") {
    const setter = getListSetter(list);
    setter((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        if (status === "editing") {
          return { ...c, status, editFields: { ...c.fields } };
        }
        return { ...c, status };
      })
    );
  }

  function updateAnalyzedEditField(
    id: string,
    field: string,
    value: string,
    list: "ai" | "paste" | "manual-file" = "paste"
  ) {
    const setter = getListSetter(list);
    setter((prev) =>
      prev.map((c) =>
        c.id === id && c.editFields
          ? { ...c, editFields: { ...c.editFields, [field]: value } }
          : c
      )
    );
  }

  function saveAnalyzedEdit(id: string, list: "ai" | "paste" | "manual-file" = "paste") {
    const setter = getListSetter(list);
    setter((prev) =>
      prev.map((c) => {
        if (c.id !== id || !c.editFields) return c;
        return {
          ...c,
          fields: { ...c.editFields },
          status: "approved" as const,
          editFields: undefined,
        };
      })
    );
  }

  function approveAllAnalyzed(list: "ai" | "paste" | "manual-file" = "paste") {
    const setter = getListSetter(list);
    setter((prev) =>
      prev.map((c) =>
        c.status === "pending" ? { ...c, status: "approved" as const } : c
      )
    );
  }

  // Auto-save copies to the library (fire and forget)
  function autoSaveToLibrary(fields: Record<string, string>, source: string) {
    if (!orgId) return;
    fetch("/api/copy-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgId,
        headline: fields.headline || null,
        mini_copy: fields.mini_copy || null,
        cta: fields.cta || null,
        body: fields.body || null,
        source,
      }),
    }).catch(() => {});
  }

  function addApprovedCopies(list: "ai" | "paste" | "manual-file" = "paste") {
    const source = getListSource(list);
    const approved = source.filter((c) => c.status === "approved");
    if (approved.length === 0) return;

    const copySource = list === "ai" ? "ai_generated" : list === "manual-file" ? "upload" : "manual";

    // Mapeia SEMPRE pro padrão ativo (estatico → headline/subheadline/ponte/cta).
    // Os modos paste/ficheiro já mapeiam antes, mas o "gerar com IA" criava os campos
    // crus (headline/mini_copy/list_items/cta) — sem isto, a copy gerada por IA não
    // respeitava o padrão Estático selecionado.
    const newCopies: CopyItem[] = approved.map((c) => ({
      id: generateId(),
      content: mapAnalyzedToPattern(c.fields),
      source: "ai" as const,
    }));

    // Auto-save each approved copy to the library
    approved.forEach((c) => autoSaveToLibrary(c.fields, copySource));

    updateProject({ copies: [...copies, ...newCopies] });

    if (list === "ai") {
      setGeneratedCopies([]);
    } else if (list === "paste") {
      setPasteCopies([]);
      setPasteText("");
    } else if (list === "manual-file") {
      setManualFileCopies([]);
      setManualFileName(null);
      if (manualFileInputRef.current) manualFileInputRef.current.value = "";
    }
  }

  // --- "Ja tem copy" paste handler ---
  // Mapeia a copy extraída pela IA pros campos do PADRÃO ativo (estatico/mini_copy).
  function mapAnalyzedToPattern(c: Record<string, string>): Record<string, string> {
    if (copyPattern === "estatico") {
      return {
        headline: c.headline || "",
        subheadline: c.subheadline || c.mini_copy || "",
        ponte: c.ponte || c.list_items || "",
        cta: c.cta || "",
        ...(c.body ? { body: c.body } : {}),
      };
    }
    return {
      headline: c.headline || "",
      mini_copy: c.mini_copy || "",
      list_items: c.list_items || "",
      cta: c.cta || "",
      ...(c.body ? { body: c.body } : {}),
    };
  }

  async function handlePasteAnalyze() {
    if (!pasteText.trim()) return;
    setPasteLoading(true);
    setPasteError(null);
    setPasteCopies([]);

    try {
      const res = await fetch("/api/copy-library/analyze-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText.trim(), orgId, copyPattern }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const aiCopies: AiAnalyzedCopy[] = (data.copies ?? []).map(
        (c: Record<string, string>) => ({
          id: generateId(),
          fields: mapAnalyzedToPattern(c),
          status: "pending" as const,
        })
      );
      setPasteCopies(aiCopies);
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : "Erro ao organizar texto");
      setPasteCopies([]);
    } finally {
      setPasteLoading(false);
    }
  }

  // --- "Ja tem copy" file upload handler (organize, not create) ---
  async function handleManualFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setManualFileLoading(true);
    setManualFileName(file.name);
    setManualFileError(null);
    setManualFileCopies([]);

    try {
      // Read the file content and send to analyze-text endpoint (organize mode)
      const content = await file.text();
      if (!content.trim()) throw new Error("Ficheiro vazio");

      const res = await fetch("/api/copy-library/analyze-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content.trim(), orgId, copyPattern }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const aiCopies: AiAnalyzedCopy[] = (data.copies ?? []).map(
        (c: Record<string, string>) => ({
          id: generateId(),
          fields: mapAnalyzedToPattern(c),
          status: "pending" as const,
        })
      );
      setManualFileCopies(aiCopies);
    } catch (err) {
      setManualFileError(err instanceof Error ? err.message : "Erro ao analisar ficheiro");
      setManualFileCopies([]);
    } finally {
      setManualFileLoading(false);
    }
  }

  function removeCopy(id: string) {
    updateProject({ copies: copies.filter((c) => c.id !== id) });
  }

  function startEdit(copy: CopyItem) {
    setEditingId(copy.id);
    setEditFields({ ...copy.content });
  }

  function saveEdit() {
    if (!editingId) return;
    updateProject({
      copies: copies.map((c) =>
        c.id === editingId ? { ...c, content: { ...editFields } } : c
      ),
    });
    setEditingId(null);
    setEditFields({});
  }

  // --- AI handlers ---
  const hasTemplatesWithCopyElements = selectedTemplates.some(
    (t) => t.copyElements && t.copyElements.length > 0
  );

  async function generateWithAI() {
    setGenerating(true);
    setAiError(null);
    setGeneratedCopies([]);

    try {
      let requestBody: Record<string, unknown>;

      if (hasTemplatesWithCopyElements && productName.trim()) {
        // Template-aware mode (EP-02.07)
        requestBody = {
          personaId,
          productName: productName.trim(),
          salesArguments: salesArguments.trim(),
          templateIds: selectedTemplates.map((t) => t.id),
          count: aiCount,
          orgId,
          copyPattern,
        };
      } else {
        // Legacy mode (direction-based)
        if (!direction.trim()) return;
        requestBody = {
          personaId,
          elements: allElements.map((e) => e.key),
          direction: direction.trim(),
          count,
          orgId,
          copyPattern,
        };
      }

      const res = await fetch("/api/copy-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const aiCopies: AiAnalyzedCopy[] = (data.copies ?? []).map(
        (c: Record<string, string>) => ({
          id: generateId(),
          fields: { ...c },
          status: "pending" as const,
        })
      );

      if (aiCopies.length > 0) {
        setGeneratedCopies(aiCopies);
      } else {
        setAiError("Nenhuma copy gerada. Tente novamente com mais detalhes.");
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Erro ao gerar copies");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* BLOCO A — Padrão de copy do projeto */}
      <div className="bg-surface-050 rounded-xl border border-border-subtle p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-text-primary">Padrão de copy</p>
          <p className="text-xs text-text-muted mt-0.5">
            Define os campos da copy deste projeto. Vale para todos os criativos.
          </p>
        </div>
        <div className="flex gap-2">
          {(["estatico", "mini_copy"] as const).map((p) => (
            <button
              key={p}
              onClick={() => changeCopyPattern(p)}
              className={cn(
                "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                copyPattern === p
                  ? "bg-accent-champagne text-surface-000 border-accent-champagne"
                  : "bg-surface-100 text-text-muted hover:text-text-primary border-border-subtle"
              )}
              aria-pressed={copyPattern === p}
            >
              {p === "estatico" ? "Estático" : "Mini copy"}
            </button>
          ))}
        </div>

        {/* BLOCO B — Checkboxes de campos (nível projeto) */}
        <div className="pt-1">
          <p className="text-xs font-medium text-text-muted mb-2">
            Campos usados na arte (desmarque o que não quer)
          </p>
          <div className="flex flex-wrap gap-2">
            {patternFields.map((f) => {
              const checked = activeCopyFields.includes(f.key);
              return (
                <button
                  key={f.key}
                  onClick={() => toggleActiveField(f.key)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                    checked
                      ? "bg-champagne-alpha-05 text-text-primary border-accent-champagne"
                      : "bg-surface-100 text-text-muted hover:text-text-primary border-border-subtle"
                  )}
                  role="checkbox"
                  aria-checked={checked}
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded flex items-center justify-center border",
                      checked
                        ? "bg-accent-champagne border-accent-champagne"
                        : "border-border-subtle"
                    )}
                  >
                    {checked && <Check className="w-3 h-3 text-surface-000" />}
                  </span>
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Toggle modo */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setMode("manual")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            mode === "manual"
              ? "bg-accent-champagne text-surface-000"
              : "bg-surface-100 text-text-muted hover:text-text-primary"
          )}
        >
          <FileText className="w-4 h-4" />
          Ja tenho copy
        </button>
        <button
          onClick={() => setMode("ai")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            mode === "ai"
              ? "bg-accent-champagne text-surface-000"
              : "bg-surface-100 text-text-muted hover:text-text-primary"
          )}
        >
          <Sparkles className="w-4 h-4" />
          Gerar com IA
        </button>
        <button
          onClick={() => setMode("library")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            mode === "library"
              ? "bg-accent-champagne text-surface-000"
              : "bg-surface-100 text-text-muted hover:text-text-primary"
          )}
        >
          <BookOpen className="w-4 h-4" />
          Biblioteca
        </button>
      </div>
      {/* Modo "Ja tem copy" */}
      {mode === "manual" && (
        <div className="space-y-4">
          {/* Sub-mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setManualSubMode("paste")}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                manualSubMode === "paste"
                  ? "bg-surface-150 text-text-primary border border-accent-champagne"
                  : "bg-surface-050 text-text-muted hover:text-text-primary border border-border-subtle"
              )}
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              Colar texto
            </button>
            <button
              onClick={() => setManualSubMode("file")}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                manualSubMode === "file"
                  ? "bg-surface-150 text-text-primary border border-accent-champagne"
                  : "bg-surface-050 text-text-muted hover:text-text-primary border border-border-subtle"
              )}
            >
              <Upload className="w-3.5 h-3.5" />
              Enviar ficheiro
            </button>
          </div>

          {/* Sub-mode: Colar texto */}
          {manualSubMode === "paste" && (
            <div className="bg-surface-050 rounded-xl border border-border-subtle p-4 space-y-4">
              <p className="text-xs text-text-muted">
                Cole sua copy abaixo. A IA vai organizar automaticamente em headline, descricao e CTA, sem criar conteúdo novo.
              </p>

              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-champagne resize-none"
                placeholder="Cole aqui sua copy completa... A IA vai organizar em campos estruturados."
              />

              {pasteError && (
                <p className="text-sm text-accent-red">{pasteError}</p>
              )}

              {pasteCopies.length === 0 && (
                <button
                  onClick={handlePasteAnalyze}
                  disabled={pasteLoading || !pasteText.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-000 text-sm font-medium hover:bg-accent-champagne/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pasteLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {pasteLoading ? "Organizando..." : "Organizar com IA"}
                </button>
              )}

              {/* Preview de copies organizadas (paste) */}
              {pasteCopies.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-text-primary">
                      {pasteCopies.length} {pasteCopies.length === 1 ? "copy organizada" : "copies organizadas"}. Revise antes de adicionar:
                    </p>
                    <button
                      onClick={() => approveAllAnalyzed("paste")}
                      className="text-xs text-accent-champagne hover:underline"
                    >
                      Aprovar todas
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {pasteCopies.map((copy) => (
                      <AnalyzedCopyCard
                        key={copy.id}
                        copy={copy}
                        list="paste"
                        patternFields={patternFields}
                        onSetStatus={setAnalyzedStatus}
                        onEditField={updateAnalyzedEditField}
                        onSaveEdit={saveAnalyzedEdit}
                      />
                    ))}
                  </div>

                  {pasteCopies.some((c) => c.status === "approved") && (
                    <button
                      onClick={() => addApprovedCopies("paste")}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-000 text-sm font-medium hover:bg-accent-champagne/90"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar aprovadas ({pasteCopies.filter((c) => c.status === "approved").length})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sub-mode: Enviar ficheiro */}
          {manualSubMode === "file" && (
            <div className="bg-surface-050 rounded-xl border border-border-subtle p-4 space-y-4">
              <p className="text-xs text-text-muted">
                Envie um ficheiro de texto (.txt, .md) com sua copy. A IA vai organizar em headline, descricao e CTA, sem criar conteúdo novo.
              </p>

              <input
                ref={manualFileInputRef}
                type="file"
                accept=".txt,.md,.text"
                onChange={handleManualFileUpload}
                className="hidden"
              />

              {!manualFileName ? (
                <button
                  onClick={() => manualFileInputRef.current?.click()}
                  disabled={manualFileLoading}
                  className="w-full flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-border-subtle hover:border-accent-champagne transition-colors"
                >
                  <Upload className="w-8 h-8 text-text-muted" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-text-primary">Clique para enviar</p>
                    <p className="text-xs text-text-muted mt-1">.txt ou .md, a IA organiza sua copy</p>
                  </div>
                </button>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-lg bg-surface-100">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-accent-champagne" />
                    <span className="text-sm text-text-primary">{manualFileName}</span>
                  </div>
                  <button
                    onClick={() => {
                      setManualFileCopies([]);
                      setManualFileName(null);
                      setManualFileError(null);
                      if (manualFileInputRef.current) manualFileInputRef.current.value = "";
                    }}
                    className="p-1 rounded hover:bg-surface-150"
                  >
                    <X className="w-4 h-4 text-text-muted" />
                  </button>
                </div>
              )}

              {manualFileLoading && (
                <div className="flex flex-col items-center gap-2 py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-accent-champagne" />
                  <p className="text-xs text-text-muted">Organizando copy com IA...</p>
                </div>
              )}

              {manualFileError && (
                <p className="text-sm text-accent-red">{manualFileError}</p>
              )}

              {/* Preview de copies organizadas (manual file) */}
              {manualFileCopies.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-text-primary">
                      {manualFileCopies.length} {manualFileCopies.length === 1 ? "copy organizada" : "copies organizadas"}. Revise antes de adicionar:
                    </p>
                    <button
                      onClick={() => approveAllAnalyzed("manual-file")}
                      className="text-xs text-accent-champagne hover:underline"
                    >
                      Aprovar todas
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {manualFileCopies.map((copy) => (
                      <AnalyzedCopyCard
                        key={copy.id}
                        copy={copy}
                        list="manual-file"
                        patternFields={patternFields}
                        onSetStatus={setAnalyzedStatus}
                        onEditField={updateAnalyzedEditField}
                        onSaveEdit={saveAnalyzedEdit}
                      />
                    ))}
                  </div>

                  {manualFileCopies.some((c) => c.status === "approved") && (
                    <button
                      onClick={() => addApprovedCopies("manual-file")}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-000 text-sm font-medium hover:bg-accent-champagne/90"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar aprovadas ({manualFileCopies.filter((c) => c.status === "approved").length})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modo IA */}
      {mode === "ai" && (
        <div className="bg-surface-050 rounded-xl border border-border-subtle p-4 space-y-4">
          {hasTemplatesWithCopyElements ? (
            <>
              <p className="text-xs text-text-muted">
                A IA vai gerar copies baseadas nos templates selecionados e no seu produto.
              </p>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Produto principal
                </label>
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-champagne"
                  placeholder="Ex: Curso de Marketing Digital, Consultoria Empresarial..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Argumentos de venda e diferenciais
                </label>
                <textarea
                  value={salesArguments}
                  onChange={(e) => setSalesArguments(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-champagne resize-none"
                  placeholder="Descreva seu produto com detalhes: argumentos, diferenciais, beneficios, o que voce quer destacar..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Quantidade de versoes
                </label>
                <select
                  value={aiCount}
                  onChange={(e) => setAiCount(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
                >
                  {[1, 2, 3, 5, 10].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "versao" : "versoes"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] text-text-muted">Templates:</span>
                {selectedTemplates.map((t) => (
                  <span
                    key={t.id}
                    className="px-2 py-0.5 rounded-full text-[10px] bg-surface-100 text-text-secondary"
                  >
                    {t.name || t.category || "Template"}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Elementos que serao gerados
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {allElements.map((el) => (
                    <span
                      key={el.key}
                      className="px-2.5 py-1 rounded-full text-xs bg-surface-100 text-text-secondary"
                    >
                      {el.label}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Direcionamento / Tema
                </label>
                <textarea
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-champagne resize-none"
                  placeholder="Ex: Campanha de lancamento do curso X, foco em urgencia e escassez..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Quantidade de versoes
                </label>
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
                >
                  {[1, 2, 3, 5, 10].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "versao" : "versoes"}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {!personaId && (
            <p className="text-xs text-text-muted bg-surface-100 rounded-lg px-3 py-2">
              Sem persona selecionada. O copy sera gerado para publico geral.
            </p>
          )}

          {aiError && <p className="text-sm text-accent-red">{aiError}</p>}

          <button
            onClick={generateWithAI}
            disabled={
              generating ||
              (hasTemplatesWithCopyElements ? !productName.trim() : !direction.trim())
            }
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-000 text-sm font-medium hover:bg-accent-champagne/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generating ? "Gerando..." : "Gerar com IA"}
          </button>

          {/* Preview de copies geradas pela IA */}
          {generatedCopies.length > 0 && (
            <div className="space-y-3 border-t border-border-subtle pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-text-primary">
                  {generatedCopies.length} copies geradas. Revise as copies abaixo e aprove para continuar.
                </p>
                <button
                  onClick={() => approveAllAnalyzed("ai")}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-accent-champagne text-surface-000 text-sm font-semibold shadow-sm hover:bg-accent-champagne/90 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Aprovar todas
                </button>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {generatedCopies.map((copy) => {
                  if (copy.status === "discarded") return null;

                  return (
                    <div
                      key={copy.id}
                      className={cn(
                        "rounded-lg border p-3 transition-all",
                        copy.status === "approved"
                          ? "border-accent-green bg-accent-green-dim"
                          : copy.status === "editing"
                          ? "border-accent-champagne bg-champagne-alpha-05"
                          : "border-border-subtle bg-surface-050"
                      )}
                    >
                      {copy.status === "editing" && copy.editFields ? (
                        <div className="space-y-2">
                          {Object.entries(copy.editFields).map(([key, value]) => (
                            <div key={key}>
                              <label className="text-[10px] text-text-muted capitalize">{key.replace(/_/g, " ")}</label>
                              {value.length > 60 ? (
                                <textarea
                                  value={value}
                                  onChange={(e) => updateAnalyzedEditField(copy.id, key, e.target.value, "ai")}
                                  rows={2}
                                  className="w-full px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-text-primary text-xs focus:outline-none focus:border-accent-champagne resize-none"
                                />
                              ) : (
                                <input
                                  value={value}
                                  onChange={(e) => updateAnalyzedEditField(copy.id, key, e.target.value, "ai")}
                                  className="w-full px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-text-primary text-xs focus:outline-none focus:border-accent-champagne"
                                />
                              )}
                            </div>
                          ))}
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => saveAnalyzedEdit(copy.id, "ai")}
                              className="p-1 rounded hover:bg-accent-green/20"
                              title="Salvar e aprovar"
                            >
                              <Check className="w-3.5 h-3.5 text-accent-green" />
                            </button>
                            <button
                              onClick={() => setAnalyzedStatus(copy.id, "pending", "ai")}
                              className="p-1 rounded hover:bg-accent-red/20"
                              title="Cancelar edicao"
                            >
                              <X className="w-3.5 h-3.5 text-accent-red" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {Object.entries(copy.fields).map(([key, value]) => {
                            if (!value) return null;
                            const isMain = key === "headline";
                            return (
                              <p
                                key={key}
                                className={cn(
                                  "text-xs",
                                  isMain ? "text-text-primary font-medium" : key === "cta" ? "text-accent-champagne" : "text-text-secondary"
                                )}
                              >
                                {typeof value === "object" ? JSON.stringify(value) : value}
                              </p>
                            );
                          })}
                          <div className="flex items-center gap-1 pt-1">
                            {copy.status !== "approved" ? (
                              <button
                                onClick={() => setAnalyzedStatus(copy.id, "approved", "ai")}
                                className="p-1 rounded hover:bg-accent-green/20"
                                title="Aprovar"
                              >
                                <Check className="w-3.5 h-3.5 text-accent-green" />
                              </button>
                            ) : (
                              <span className="text-[10px] text-accent-green px-1.5 py-0.5 rounded bg-accent-green-dim">
                                Aprovada
                              </span>
                            )}
                            <button
                              onClick={() => setAnalyzedStatus(copy.id, "editing", "ai")}
                              className="p-1 rounded hover:bg-surface-100"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-text-muted" />
                            </button>
                            <button
                              onClick={() => setAnalyzedStatus(copy.id, "discarded", "ai")}
                              className="p-1 rounded hover:bg-accent-red-dim"
                              title="Descartar"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-text-muted hover:text-accent-red" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {generatedCopies.some((c) => c.status === "approved") && (
                <button
                  onClick={() => addApprovedCopies("ai")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-000 text-sm font-medium hover:bg-accent-champagne/90"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar aprovadas ({generatedCopies.filter((c) => c.status === "approved").length})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modo biblioteca */}
      {mode === "library" && (
        <CopyLibraryBrowser
          orgId={orgId}
          busy={libraryOrganizing}
          onSelect={async (selectedCopies) => {
            // A copy da biblioteca vem com campos antigos (mini_copy com sub+bullets
            // misturados). Pra respeitar o padrão Estático, REORGANIZAMOS cada copy
            // com IA (analyze-text + copyPattern), separando de verdade em
            // headline/subheadline/ponte/cta. Sem isso ficava tudo grudado no mini_copy.
            setLibraryOrganizing(true);
            try {
              const organized = await Promise.all(
                selectedCopies.map(async (c) => {
                  const rawText = [c.headline, c.mini_copy, c.list_items, c.cta]
                    .filter(Boolean)
                    .join("\n");
                  try {
                    const res = await fetch("/api/copy-library/analyze-text", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ text: rawText, orgId, copyPattern }),
                    });
                    const data = await res.json();
                    const first = res.ok && Array.isArray(data.copies) ? data.copies[0] : null;
                    if (first) {
                      return {
                        id: generateId(),
                        content: mapAnalyzedToPattern(first),
                        source: "library" as const,
                        libraryId: c.id,
                      };
                    }
                  } catch {
                    // se a IA falhar, cai no mapeamento mecânico abaixo
                  }
                  return {
                    id: generateId(),
                    content: mapAnalyzedToPattern({
                      headline: c.headline || "",
                      mini_copy: c.mini_copy || "",
                      list_items: c.list_items || "",
                      cta: c.cta || "",
                      ...(c.body ? { body: c.body } : {}),
                    }),
                    source: "library" as const,
                    libraryId: c.id,
                  };
                })
              );
              updateProject({ copies: [...copies, ...organized] });
            } finally {
              setLibraryOrganizing(false);
            }
          }}
        />
      )}

      {/* Lista de copies adicionadas */}
      {copies.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-text-primary">
            Copies adicionadas ({copies.length})
          </h3>
          {copies.map((copy, index) => (
            <div
              key={copy.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-surface-050 border border-border-subtle"
            >
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-surface-100 flex items-center justify-center text-xs font-medium text-text-muted">
                {index + 1}
              </span>
              <div className="flex-1 min-w-0">
                {editingId === copy.id ? (
                  <div className="space-y-2">
                    {(() => {
                      const KNOWN_LABELS: Record<string, string> = {
                        headline: "Headline",
                        mini_copy: "Mini copy",
                        sub_headline: "Subheadline",
                        subheadline: "Subheadline",
                        list_items: "Lista",
                        list: "Lista",
                        cta: "CTA",
                        body: "Corpo",
                        nota_visual: "Nota visual",
                      };
                      // ORDEM CANONICA DO PADRAO primeiro, depois extras da copy.
                      const seen = new Set<string>();
                      const ordered: Array<{ key: string; label: string }> = [];
                      for (const f of patternFields) {
                        seen.add(f.key);
                        ordered.push({ key: f.key, label: f.label });
                      }
                      for (const key of Object.keys(copy.content)) {
                        if (!seen.has(key)) {
                          seen.add(key);
                          ordered.push({ key, label: KNOWN_LABELS[key] || key });
                        }
                      }
                      return ordered.map(({ key, label }) => (
                        <div key={key}>
                          <label className="text-[10px] text-text-muted">{label}</label>
                          <textarea
                            value={editFields[key] ?? ""}
                            onChange={(e) =>
                              setEditFields({ ...editFields, [key]: e.target.value })
                            }
                            rows={key === "list_items" || key === "body" || key === "mini_copy" ? 3 : 1}
                            className="w-full px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-text-primary text-xs focus:outline-none focus:border-accent-champagne resize-y"
                          />
                        </div>
                      ));
                    })()}
                    <div className="flex gap-1.5">
                      <button onClick={saveEdit} className="p-1 rounded hover:bg-accent-green/20">
                        <Check className="w-3.5 h-3.5 text-accent-green" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 rounded hover:bg-accent-red/20"
                      >
                        <X className="w-3.5 h-3.5 text-accent-red" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {(() => {
                      // Labels conhecidos (fallback quando o template ainda nao expoe esse elemento)
                      const KNOWN_LABELS: Record<string, string> = {
                        headline: "Headline",
                        mini_copy: "Mini copy",
                        sub_headline: "Subheadline",
                        subheadline: "Subheadline",
                        list_items: "Lista",
                        list: "Lista",
                        cta: "CTA",
                        body: "Corpo",
                        nota_visual: "Nota visual",
                      };
                      const hasText = (val: unknown) => {
                        if (!val) return false;
                        const txt = typeof val === "object" ? JSON.stringify(val) : String(val);
                        return txt.trim().length > 0;
                      };
                      // ORDEM CANONICA DO PADRAO: primeiro os campos do padrao ativo
                      // (Estatico: headline/subheadline/ponte/cta | Mini copy:
                      // headline/mini_copy/list_items/cta), depois extras que sobrarem.
                      const seen = new Set<string>();
                      const ordered: Array<{ key: string; label: string }> = [];
                      for (const f of patternFields) {
                        seen.add(f.key);
                        if (hasText(copy.content[f.key])) ordered.push({ key: f.key, label: f.label });
                      }
                      for (const key of Object.keys(copy.content)) {
                        if (seen.has(key) || !hasText(copy.content[key])) continue;
                        const elMatch = allElements.find((el) => el.key === key);
                        ordered.push({ key, label: elMatch?.label || KNOWN_LABELS[key] || key });
                      }
                      if (ordered.length === 0) {
                        return (
                          <p className="text-xs italic text-text-muted">(copy sem conteúdo preenchido)</p>
                        );
                      }
                      return ordered.map(({ key, label }) => {
                        const val = copy.content[key];
                        const txt = typeof val === "object" ? JSON.stringify(val) : String(val);
                        return (
                          <p key={key} className="text-xs text-text-secondary leading-snug">
                            <span className="text-text-muted font-medium">{label}:</span>{" "}
                            <span className="whitespace-pre-wrap break-words">{txt}</span>
                          </p>
                        );
                      });
                    })()}
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-surface-100 text-text-muted">
                      {copy.source === "ai" ? "IA" : copy.source === "library" ? "Biblioteca" : "manual"}
                    </span>
                  </div>
                )}
              </div>
              {editingId !== copy.id && (
                <div className="flex gap-1">
                  <button
                    onClick={() => startEdit(copy)}
                    className="p-1.5 rounded-lg hover:bg-surface-100 text-text-muted hover:text-text-primary"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeCopy(copy.id)}
                    className="p-1.5 rounded-lg hover:bg-accent-red-dim text-text-muted hover:text-accent-red"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Card de uma copy organizada pela IA (modos "Colar texto" e "Enviar ficheiro").
 * Os campos editáveis e exibidos derivam do PADRÃO ativo (patternFields), pra
 * todos os 4 campos aparecerem consistentemente em qualquer modo.
 */
function AnalyzedCopyCard({
  copy,
  list,
  patternFields,
  onSetStatus,
  onEditField,
  onSaveEdit,
}: {
  copy: AiAnalyzedCopy;
  list: "ai" | "paste" | "manual-file";
  patternFields: { key: string; label: string }[];
  onSetStatus: (id: string, status: AiAnalyzedCopy["status"], list: "ai" | "paste" | "manual-file") => void;
  onEditField: (id: string, field: string, value: string, list: "ai" | "paste" | "manual-file") => void;
  onSaveEdit: (id: string, list: "ai" | "paste" | "manual-file") => void;
}) {
  if (copy.status === "discarded") return null;

  const longField = (key: string) => key === "ponte" || key === "mini_copy" || key === "list_items" || key === "body";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all",
        copy.status === "approved"
          ? "border-accent-green bg-accent-green-dim"
          : copy.status === "editing"
          ? "border-accent-champagne bg-champagne-alpha-05"
          : "border-border-subtle bg-surface-050"
      )}
    >
      {copy.status === "editing" && copy.editFields ? (
        <div className="space-y-2">
          {patternFields.map((f) => (
            <div key={f.key}>
              <label className="text-[10px] text-text-muted">{f.label}</label>
              {longField(f.key) ? (
                <textarea
                  value={copy.editFields?.[f.key] ?? ""}
                  onChange={(e) => onEditField(copy.id, f.key, e.target.value, list)}
                  rows={2}
                  className="w-full px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-text-primary text-xs focus:outline-none focus:border-accent-champagne resize-none"
                />
              ) : (
                <input
                  value={copy.editFields?.[f.key] ?? ""}
                  onChange={(e) => onEditField(copy.id, f.key, e.target.value, list)}
                  className="w-full px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-text-primary text-xs focus:outline-none focus:border-accent-champagne"
                />
              )}
            </div>
          ))}
          <div className="flex gap-1.5">
            <button
              onClick={() => onSaveEdit(copy.id, list)}
              className="p-1 rounded hover:bg-accent-green/20"
              title="Salvar e aprovar"
            >
              <Check className="w-3.5 h-3.5 text-accent-green" />
            </button>
            <button
              onClick={() => onSetStatus(copy.id, "pending", list)}
              className="p-1 rounded hover:bg-accent-red/20"
              title="Cancelar edicao"
            >
              <X className="w-3.5 h-3.5 text-accent-red" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {patternFields.map((f) => {
            const val = copy.fields[f.key];
            if (!val) return null;
            return (
              <p
                key={f.key}
                className={cn(
                  "text-xs",
                  f.key === "headline"
                    ? "text-text-primary font-medium"
                    : f.key === "cta"
                    ? "text-accent-champagne"
                    : "text-text-secondary"
                )}
              >
                {val}
              </p>
            );
          })}
          <div className="flex items-center gap-1 pt-1">
            {copy.status !== "approved" ? (
              <button
                onClick={() => onSetStatus(copy.id, "approved", list)}
                className="p-1 rounded hover:bg-accent-green/20"
                title="Aprovar"
              >
                <Check className="w-3.5 h-3.5 text-accent-green" />
              </button>
            ) : (
              <span className="text-[10px] text-accent-green px-1.5 py-0.5 rounded bg-accent-green-dim">
                Aprovada
              </span>
            )}
            <button
              onClick={() => onSetStatus(copy.id, "editing", list)}
              className="p-1 rounded hover:bg-surface-100"
              title="Editar"
            >
              <Edit2 className="w-3.5 h-3.5 text-text-muted" />
            </button>
            <button
              onClick={() => onSetStatus(copy.id, "discarded", list)}
              className="p-1 rounded hover:bg-accent-red-dim"
              title="Descartar"
            >
              <Trash2 className="w-3.5 h-3.5 text-text-muted hover:text-accent-red" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

