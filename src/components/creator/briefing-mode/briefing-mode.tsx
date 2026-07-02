"use client";


import { useState, useEffect } from "react";
import {
  FileText,
  Sparkles,
  Zap,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Trash2,
  Download,
  CheckCircle2,
  ImagePlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { optimizeImageForUpload } from "@/lib/client-image-optimization";
import type { BriefingItem, BriefingPrompt, BriefingFormat } from "@/lib/briefing-types";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_REF_IMAGE_SIZE = 4 * 1024 * 1024;

/** Imagem de referÃªncia subida no modo briefing (rodÃ­zio entre os criativos). */
interface BriefingRefImage {
  file_path: string;
  url: string;
  label: string;
}

const STEPS = [
  { label: "Briefing", icon: FileText },
  { label: "Prompts", icon: Sparkles },
  { label: "Gerar", icon: Zap },
] as const;

const DEFAULT_FORMATS: BriefingFormat[] = [
  { width: 1080, height: 1080, label: "1080x1080 (Feed 1:1)" },
  { width: 1080, height: 1350, label: "1080x1350 (Feed 4:5)" },
  { width: 1080, height: 1920, label: "1080x1920 (Story 9:16)" },
];

interface Option { id: string; name: string }

interface GeneratedCreative {
  id: string;
  prompt: string;
  status: "pending" | "generating" | "completed" | "error";
  imageUrl?: string;
  error?: string;
  formatLabel: string;
}

export function BriefingMode({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);

  // Setup (passo 1)
  const [markdown, setMarkdown] = useState("");
  const [brandKits, setBrandKits] = useState<Option[]>([]);
  const [brandKitId, setBrandKitId] = useState("");
  const [personas, setPersonas] = useState<Option[]>([]);
  const [personaId, setPersonaId] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<BriefingFormat[]>([DEFAULT_FORMATS[0]]);
  const [items, setItems] = useState<BriefingItem[]>([]);

  // Imagens de referÃªncia (opcional) â€” rodÃ­zio entre criativos + instruÃ§Ã£o
  const [refImages, setRefImages] = useState<BriefingRefImage[]>([]);
  const [imageInstruction, setImageInstruction] = useState("");
  const [uploadingRefs, setUploadingRefs] = useState(false);

  // Prompts (passo 2)
  const [prompts, setPrompts] = useState<BriefingPrompt[]>([]);

  // Gerar (passo 3)
  const [creatives, setCreatives] = useState<GeneratedCreative[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createBrowserSupabase();
      const [{ data: kits }, { data: pers }] = await Promise.all([
        supabase.from("criativos_brand_kits").select("id, name").eq("org_id", orgId).order("name"),
        supabase.from("criativos_personas").select("id, name").eq("org_id", orgId).order("name"),
      ]);
      if (kits) { setBrandKits(kits); if (kits.length) setBrandKitId(kits[0].id); }
      if (pers) setPersonas(pers);
    }
    load();
  }, [orgId]);

  function toggleFormat(fmt: BriefingFormat) {
    setSelectedFormats((prev) =>
      prev.some((f) => f.label === fmt.label)
        ? prev.filter((f) => f.label !== fmt.label)
        : [...prev, fmt],
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  // â”€â”€ Imagens de referÃªncia (upload no bucket expert-photos) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleRefImagesUpload(files: FileList | File[]) {
    const fileArray = Array.from(files).filter((f) => {
      if (!PHOTO_TYPES.includes(f.type)) {
        setError(`${f.name}: tipo nÃ£o suportado (use JPG, PNG ou WEBP).`);
        return false;
      }
      return true;
    });
    if (fileArray.length === 0) return;

    setUploadingRefs(true);
    setError(null);
    try {
      const supabase = createBrowserSupabase();
      const uploaded: BriefingRefImage[] = [];
      for (const raw of fileArray) {
        let file = raw;
        try {
          file = await optimizeImageForUpload(raw, { maxBytes: MAX_REF_IMAGE_SIZE, maxDimension: 1600 });
        } catch { /* segue com o ficheiro original se a otimizaÃ§Ã£o falhar */ }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("bucket", "expert-photos");
        formData.append("path", orgId);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Falha no upload da imagem.");

        // expert-photos Ã© bucket privado â†’ gerar signed URL pro preview
        let url = "";
        const { data: signed } = await supabase.storage
          .from("expert-photos")
          .createSignedUrl(data.file_path, 3600);
        if (signed?.signedUrl) url = signed.signedUrl;

        uploaded.push({
          file_path: data.file_path,
          url,
          label: data.file_name || (data.file_path as string).split("/").pop() || "Imagem",
        });
      }

      setRefImages((prev) => {
        const seen = new Set(prev.map((r) => r.file_path));
        const novos = uploaded.filter((u) => !seen.has(u.file_path));
        return [...prev, ...novos];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao subir imagens.");
    } finally {
      setUploadingRefs(false);
    }
  }

  function removeRefImage(filePath: string) {
    setRefImages((prev) => prev.filter((r) => r.file_path !== filePath));
  }

  // â”€â”€ AÃ§Ãµes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Passo 1 â†’ 2: parse + build-prompts (faz os dois de uma vez ao avanÃ§ar)
  async function handleProcessBriefing() {
    setError(null);
    if (!markdown.trim()) return setError("Cole o briefing primeiro.");
    if (!brandKitId) return setError("Selecione um brand kit.");
    if (selectedFormats.length === 0) return setError("Selecione ao menos um formato.");
    setLoading(true);
    try {
      const parseRes = await fetch("/api/briefing/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      const parseJson = await parseRes.json();
      if (!parseRes.ok) throw new Error(parseJson.error || "Falha ao processar o briefing.");
      if (!parseJson.items?.length) throw new Error("Nenhum item identificado no briefing.");
      setItems(parseJson.items);

      const bpRes = await fetch("/api/briefing/build-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: parseJson.items,
          formats: selectedFormats,
          brandKitId,
          imageInstruction: refImages.length > 0 ? imageInstruction.trim() || undefined : undefined,
          hasReferenceImages: refImages.length > 0,
        }),
      });
      const bpJson = await bpRes.json();
      if (!bpRes.ok) throw new Error(bpJson.error || "Falha ao gerar prompts.");
      setPrompts(bpJson.prompts || []);
      setCurrentStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao processar.");
    } finally {
      setLoading(false);
    }
  }

  function updatePrompt(idx: number, value: string) {
    setPrompts((prev) => prev.map((p, i) => (i === idx ? { ...p, prompt: value } : p)));
  }

  // Aplicar uma instruÃ§Ã£o a TODOS os prompts de uma vez (anexa no fim de cada um).
  const [bulkInstruction, setBulkInstruction] = useState("");
  function applyToAll() {
    const txt = bulkInstruction.trim();
    if (!txt) return;
    setPrompts((prev) => prev.map((p) => ({ ...p, prompt: `${p.prompt}\n\n${txt}` })));
    setBulkInstruction("");
  }

  // Passo 2 â†’ 3: gera
  async function handleGenerate() {
    setError(null);
    if (prompts.length === 0) return setError("Nenhum prompt para gerar.");
    setLoading(true);
    setGenerating(true);
    try {
      const res = await fetch("/api/briefing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandKitId,
          personaId: personaId || undefined,
          formats: selectedFormats,
          prompts,
          referenceImages: refImages.map((r) => ({ file_path: r.file_path })),
          imageInstruction: imageInstruction.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao preparar a geraÃ§Ã£o.");
      setProjectId(json.projectId);
      const initial: GeneratedCreative[] = (json.creatives || []).map(
        (c: { id: string; prompt: string }, i: number) => ({
          id: c.id, prompt: c.prompt, status: "pending" as const, formatLabel: prompts[i]?.formatLabel ?? "",
        }),
      );
      setCreatives(initial);
      setCurrentStep(2);
      setLoading(false);

      const supabase = createBrowserSupabase();
      for (const c of initial) {
        setCreatives((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "generating" } : x)));
        try {
          const one = await fetch("/api/generate/one", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ creativeId: c.id, promptOverride: c.prompt }),
          });
          const oj = await one.json();
          if (one.ok && oj.success) {
            const { data: row } = await supabase
              .from("criativos_creatives").select("file_path").eq("id", c.id).single();
            let imageUrl: string | undefined;
            if (row?.file_path) {
              const { data: signed } = await supabase.storage.from("creatives").createSignedUrl(row.file_path, 3600);
              imageUrl = signed?.signedUrl ? `${signed.signedUrl}&v=${Date.now()}` : undefined;
            }
            setCreatives((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "completed", imageUrl } : x)));
          } else {
            setCreatives((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "error", error: oj.error || "Falha" } : x)));
          }
        } catch (e) {
          setCreatives((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "error", error: e instanceof Error ? e.message : "Erro" } : x)));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar.");
      setLoading(false);
    } finally {
      setGenerating(false);
    }
  }

  function handleDownloadZip() {
    if (projectId) window.open(`/api/generate/download?projectId=${projectId}`, "_blank");
  }

  // â”€â”€ NavegaÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function canAdvance(): boolean {
    if (currentStep === 0) return markdown.trim().length > 0 && !!brandKitId && selectedFormats.length > 0;
    if (currentStep === 1) return prompts.length > 0;
    return false;
  }
  function handleNext() {
    if (currentStep === 0) handleProcessBriefing();
    else if (currentStep === 1) handleGenerate();
  }
  function handleBack() {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  }

  const completedCount = creatives.filter((c) => c.status === "completed").length;

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="space-y-6 pb-28">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Lote por Briefing</h1>
            <p className="text-sm text-text-muted mt-1">
              Cole um briefing, revise os prompts e gere todos os criativos de uma vez.
            </p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          return (
            <div key={step.label} className="flex items-center">
              <div
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border whitespace-nowrap",
                  isActive
                    ? "border-accent-champagne bg-accent-champagne text-surface-000 shadow-[var(--shadow-accent-glow)]"
                    : isDone
                      ? "border-accent-champagne/30 text-accent-champagne"
                      : "border-border-subtle bg-surface-050 text-text-muted/80",
                )}
                style={isDone ? { background: "var(--champagne-alpha-10)" } : undefined}
              >
                <Icon className="w-4 h-4" />
                <span>{step.label}</span>
                {isDone && <CheckCircle2 className="w-3.5 h-3.5" />}
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-text-muted/40 mx-0.5" />}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: "var(--champagne-alpha-10)", color: "var(--accent-champagne)" }}>
          {error}
        </div>
      )}

      {/* ConteÃºdo do step */}
      <div className="theme-panel rounded-[26px] p-6 min-h-[400px]">
        <h2 className="text-lg font-semibold text-text-primary mb-4">{STEPS[currentStep]?.label}</h2>

        {/* PASSO 1 â€” Setup + Briefing */}
        {currentStep === 0 && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="theme-panel rounded-[22px] p-4 space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Brand kit</label>
                <select
                  value={brandKitId}
                  onChange={(e) => setBrandKitId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-100 border border-border-subtle text-text-primary text-sm"
                >
                  {brandKits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
                <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted pt-1">Persona (opcional)</label>
                <select
                  value={personaId}
                  onChange={(e) => setPersonaId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-100 border border-border-subtle text-text-primary text-sm"
                >
                  <option value="">Sem persona</option>
                  {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="theme-panel rounded-[22px] p-4 space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Formatos</label>
                <div className="grid grid-cols-1 gap-2">
                  {DEFAULT_FORMATS.map((fmt) => {
                    const active = selectedFormats.some((f) => f.label === fmt.label);
                    return (
                      <button
                        key={fmt.label}
                        onClick={() => toggleFormat(fmt)}
                        className={cn(
                          "flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                          active ? "border-accent-champagne text-accent-champagne" : "border-border-subtle text-text-secondary hover:border-border-default",
                        )}
                        style={active ? { background: "var(--champagne-alpha-05)" } : undefined}
                      >
                        <span>{fmt.label}</span>
                        {active && <CheckCircle2 className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="theme-panel rounded-[22px] p-4 space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Briefing (markdown)</label>
              <textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                rows={14}
                placeholder="Cole aqui o briefing com os criativos. Cada um pode ter ideia, copy e direÃ§Ã£o visual (ou um prompt pronto)..."
                className="w-full px-4 py-3 rounded-xl bg-surface-100 border border-border-subtle text-text-primary text-sm font-mono leading-relaxed"
              />
              <p className="text-xs text-text-muted">
                A IA separa cada criativo. Se o briefing jÃ¡ trouxer prompts prontos, eles sÃ£o usados direto.
              </p>
            </div>

            {/* Imagens de referÃªncia (opcional) */}
            <div className="theme-panel rounded-[22px] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Imagens de referÃªncia (opcional)
                </label>
                {refImages.length > 0 && (
                  <span className="text-[11px] text-text-muted">
                    {refImages.length} imagem{refImages.length > 1 ? "ns" : ""} Â· rodÃ­zio entre os criativos
                  </span>
                )}
              </div>

              <label
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-sm cursor-pointer transition-colors",
                  uploadingRefs
                    ? "border-border-subtle text-text-muted/60"
                    : "border-border-subtle text-text-secondary hover:border-accent-champagne hover:text-accent-champagne",
                )}
              >
                {uploadingRefs ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ImagePlus className="w-4 h-4" />
                )}
                <span>{uploadingRefs ? "Enviando..." : "Subir imagens (JPG, PNG, WEBP)"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={uploadingRefs}
                  onChange={(e) => {
                    if (e.target.files?.length) handleRefImagesUpload(e.target.files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>

              {refImages.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {refImages.map((img) => (
                    <div
                      key={img.file_path}
                      className="relative rounded-xl border border-border-subtle overflow-hidden aspect-square bg-surface-100"
                    >
                      {img.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImagePlus className="w-5 h-5 text-text-muted/50" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRefImage(img.file_path)}
                        title="Remover imagem"
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-surface-000/80 text-text-secondary hover:text-red-400 flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  O que fazer com as imagens
                </label>
                <textarea
                  value={imageInstruction}
                  onChange={(e) => setImageInstruction(e.target.value)}
                  rows={3}
                  placeholder="Ex.: usar como fundo preservado (foto real da franquia) com o texto por cima; ou usar como referÃªncia de estilo/cores."
                  className="w-full px-4 py-3 rounded-xl bg-surface-100 border border-border-subtle text-text-primary text-sm leading-relaxed"
                />
                <p className="text-xs text-text-muted">
                  As imagens entram no rodÃ­zio: cada criativo usa uma delas como referÃªncia, seguindo a instruÃ§Ã£o acima.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* PASSO 2 â€” Itens + Prompts editÃ¡veis */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              {prompts.length} {prompts.length === 1 ? "prompt" : "prompts"} de {items.length} {items.length === 1 ? "criativo" : "criativos"} Ã— {selectedFormats.length} formato(s). Revise e edite antes de gerar.
            </p>

            {/* Aplicar instruÃ§Ã£o a todos os prompts de uma vez */}
            <div className="theme-panel rounded-[22px] p-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-1">
                  Aplicar a todos os prompts
                </label>
                <input
                  value={bulkInstruction}
                  onChange={(e) => setBulkInstruction(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") applyToAll(); }}
                  placeholder="Ex: deixe o fundo mais escuro / adicione um selo de garantia / varie o cenÃ¡rio..."
                  className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-xs"
                />
              </div>
              <button
                onClick={applyToAll}
                disabled={!bulkInstruction.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 whitespace-nowrap"
                style={{ background: "var(--gradient-cta)", color: "var(--surface-000)" }}
              >
                Aplicar a todos
              </button>
            </div>

            {prompts.map((p, idx) => {
              const item = items.find((it) => it.id === p.itemId);
              return (
                <div key={`${p.itemId}-${p.formatLabel}`} className="theme-panel rounded-[22px] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {item?.titulo || p.itemId}
                        {item?.angulo && <span className="text-text-muted font-normal"> Â· {item.angulo}</span>}
                      </p>
                      <p className="text-xs text-text-muted">{p.formatLabel} Â· {p.width}x{p.height}</p>
                    </div>
                    {items.length > 1 && (
                      <button
                        onClick={() => { removeItem(p.itemId); setPrompts((prev) => prev.filter((x) => x.itemId !== p.itemId)); }}
                        className="text-text-muted hover:text-red-400 p-1 flex-shrink-0"
                        title="Remover criativo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {item?.headline && <p className="text-xs text-text-secondary">ðŸ“° {item.headline}</p>}
                  <textarea
                    value={p.prompt}
                    onChange={(e) => updatePrompt(idx, e.target.value)}
                    rows={5}
                    className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-xs font-mono leading-relaxed"
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* PASSO 3 â€” Gerar / grade */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-muted">{completedCount}/{creatives.length} concluÃ­dos</p>
              {projectId && completedCount > 0 && (
                <button
                  onClick={handleDownloadZip}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-border-subtle text-text-secondary hover:border-border-default"
                >
                  <Download className="w-4 h-4" /> Download ZIP
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {creatives.map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl border border-border-subtle overflow-hidden aspect-square flex items-center justify-center bg-surface-100"
                >
                  {c.status === "completed" && c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="criativo" className="w-full h-full object-cover" />
                  ) : c.status === "error" ? (
                    <div className="p-3 text-center">
                      <p className="text-xs text-red-400 font-medium">Falha</p>
                      <p className="text-[10px] text-text-muted mt-1 line-clamp-3">{c.error}</p>
                    </div>
                  ) : (
                    <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* NavegaÃ§Ã£o flutuante (some no passo 3) */}
      {currentStep < 2 && (
        <div className="theme-panel-strong flex items-center justify-between rounded-[22px] px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.36)]">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center gap-2 rounded-lg bg-surface-100 text-text-secondary px-4 py-2.5 text-sm disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </button>
          <button
            onClick={handleNext}
            disabled={!canAdvance() || loading}
            className="flex items-center gap-2 rounded-lg px-5 py-2.5 font-semibold text-sm disabled:opacity-50"
            style={{ background: "var(--gradient-cta)", color: "var(--surface-000)" }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : currentStep === 1 ? <Zap className="w-4 h-4" /> : null}
            {currentStep === 0 ? "Processar briefing" : "Gerar criativos"}
            {!loading && currentStep === 0 && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      )}

      {currentStep === 2 && !generating && (
        <div className="flex justify-end">
          <button
            onClick={onBack}
            className="px-5 py-2.5 rounded-lg text-sm border border-border-subtle text-text-secondary hover:border-border-default"
          >
            Concluir
          </button>
        </div>
      )}
    </div>
  );
}

