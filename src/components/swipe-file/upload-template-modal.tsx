"use client";


import { useState, useCallback } from "react";
import { X, Upload, Loader2 } from "lucide-react";

interface UploadTemplateModalProps {
  onClose: () => void;
  onUploaded: () => void;
  orgId: string;
}

const NICHE_OPTIONS = [
  { value: "high_ticket", label: "High Ticket" },
  { value: "infoprodutos", label: "Infoprodutos" },
  { value: "vendas", label: "Vendas" },
  { value: "marketing", label: "Marketing" },
  { value: "gestao", label: "Gestao" },
  { value: "ia", label: "IA" },
  { value: "trafego", label: "Trafego" },
  { value: "educacao", label: "Educacao" },
  { value: "financeiro", label: "Financeiro" },
  { value: "saude", label: "Saude" },
];

const OFFER_OPTIONS = [
  { value: "mentoria", label: "Mentoria" },
  { value: "curso", label: "Curso" },
  { value: "evento", label: "Evento" },
  { value: "lead_magnet", label: "Lead Magnet" },
  { value: "playbook", label: "Playbook" },
  { value: "consultoria", label: "Consultoria" },
  { value: "software", label: "Software" },
];

const FORMAT_OPTIONS = [
  { value: "story", label: "Story" },
  { value: "feed", label: "Feed" },
  { value: "carrossel", label: "Carrossel" },
];

const VISUAL_STYLE_OPTIONS = [
  { value: "minimalista", label: "Minimalista" },
  { value: "bold", label: "Bold / Impactante" },
  { value: "editorial", label: "Editorial" },
  { value: "fotografico", label: "Fotografico" },
  { value: "ilustrado", label: "Ilustrado" },
  { value: "corporativo", label: "Corporativo" },
  { value: "dark", label: "Dark / Escuro" },
  { value: "colorido", label: "Colorido" },
];

export function UploadTemplateModal({ onClose, onUploaded, orgId }: UploadTemplateModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("anuncio");
  const [tagsInput, setTagsInput] = useState("");
  const [advertiser, setAdvertiser] = useState("");
  const [niche, setNiche] = useState("");
  const [offerType, setOfferType] = useState("");
  const [sourceFormat, setSourceFormat] = useState("");
  const [visualStyle, setVisualStyle] = useState("");
  const [hook, setHook] = useState("");
  const [cta, setCta] = useState("");
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(f: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      setError("Formato invalido. Aceito: PNG, JPG, WebP");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("Arquivo muito grande (max 10MB)");
      return;
    }
    setFile(f);
    setError(null);
    setPreview(URL.createObjectURL(f));
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [name]);

  async function handleSubmit() {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      // 1. Upload da imagem
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", "templates");
      formData.append("path", orgId);

      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) throw new Error(uploadData.error);

      // 2. AnÃ¡lise visual completa via IA (sÃ­ncrona, mas tolerante a falha)
      setAnalyzing(true);
      type Analysis = {
        mini_prompt: string | null;
        background: { type: string; description: string; colors?: string[] } | null;
        text_layout: { role: string; text_found: string; position: string; grid_area?: string; size_pct?: number; style?: string; color?: string; lines?: number }[] | null;
        elements: { type: string; text_found: string; position?: string }[] | null;
        person: { present: boolean; framing?: string; grid_position?: string; coverage_pct?: number; pose?: string; clothing?: string; expression?: string; gaze_direction?: string } | null;
        has_logo: boolean | null;
        logo_position: string | null;
        logo_size_pct: number | null;
        has_person: boolean | null;
        person_pose: string | null;
        dominant_colors: string[] | null;
        visual_style: string | null;
        spacing: { text_blocks_gap?: string; margin_edges_pct?: number; overall_density?: string } | null;
      };
      let analysis: Analysis | null = null;
      try {
        const analyzeRes = await fetch("/api/template-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePath: uploadData.file_path, orgId }),
        });
        if (analyzeRes.ok) {
          const analyzeData = await analyzeRes.json();
          analysis = analyzeData.analysis ?? null;
        }
      } catch {
        // AnÃ¡lise falhou, continua sem
      }
      setAnalyzing(false);

      // 3. Salvar template no banco com tudo que veio da anÃ¡lise
      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);

      const saveRes = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          tags,
          file_path: uploadData.file_path,
          copy_elements: analysis?.elements ?? null,
          mini_prompt: analysis?.mini_prompt ?? null,
          background: analysis?.background ?? null,
          text_layout: analysis?.text_layout ?? null,
          person: analysis?.person ?? null,
          has_logo: analysis?.has_logo ?? null,
          logo_position: analysis?.logo_position ?? null,
          logo_size_pct: analysis?.logo_size_pct ?? null,
          has_person: analysis?.has_person ?? null,
          person_pose: analysis?.person_pose ?? null,
          dominant_colors: analysis?.dominant_colors ?? null,
          spacing: analysis?.spacing ?? null,
          analyzed_at: analysis ? new Date().toISOString() : null,
          org_id: orgId,
          advertiser: advertiser || null,
          niche: niche || null,
          offer_type: offerType || null,
          source_format: sourceFormat || null,
          // Se usuÃ¡rio nÃ£o escolheu visual_style manualmente, usa o detectado
          visual_style: visualStyle || analysis?.visual_style || null,
          hook: hook || null,
          cta: cta || null,
        }),
      });

      if (!saveRes.ok) {
        const saveData = await saveRes.json();
        throw new Error(saveData.error);
      }

      onUploaded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  }

  const inputClass = "w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne";
  const labelClass = "block text-xs font-medium text-text-muted mb-1";
  const selectClass = "w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface-000 rounded-2xl border border-border-subtle shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle sticky top-0 bg-surface-000 z-10">
          <h2 className="text-lg font-semibold text-text-primary">Novo Template</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Drop zone */}
          {!preview ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
                dragOver ? "border-accent-champagne bg-accent-champagne/5" : "border-border-subtle hover:border-accent-champagne/50"
              }`}
              onClick={() => document.getElementById("template-file-input")?.click()}
            >
              <Upload className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-secondary">Arraste uma imagem ou clique para selecionar</p>
              <p className="text-xs text-text-muted mt-1">PNG, JPG, WebP â€” max 10MB</p>
              <input
                id="template-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="relative">
              <img src={preview} alt="Preview" className="w-full max-h-48 object-contain rounded-lg bg-surface-100" />
              <button
                onClick={() => { setFile(null); setPreview(null); }}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Basicos */}
          <div>
            <label className={labelClass}>Nome *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Nome do template" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Categoria *</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
                <option value="anuncio">Anuncio</option>
                <option value="post">Post</option>
                <option value="story">Story</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Formato</label>
              <select value={sourceFormat} onChange={(e) => setSourceFormat(e.target.value)} className={selectClass}>
                <option value="">Selecionar...</option>
                {FORMAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Metadados */}
          <div className="pt-2 border-t border-border-subtle">
            <p className="text-xs font-medium text-text-muted mb-3 uppercase tracking-wider">Metadados</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Anunciante</label>
                <input value={advertiser} onChange={(e) => setAdvertiser(e.target.value)} className={inputClass} placeholder="@perfil ou nome" />
              </div>
              <div>
                <label className={labelClass}>Nicho</label>
                <select value={niche} onChange={(e) => setNiche(e.target.value)} className={selectClass}>
                  <option value="">Selecionar...</option>
                  {NICHE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Tipo de Oferta</label>
                <select value={offerType} onChange={(e) => setOfferType(e.target.value)} className={selectClass}>
                  <option value="">Selecionar...</option>
                  {OFFER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Estilo Visual</label>
                <select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} className={selectClass}>
                  <option value="">Selecionar...</option>
                  {VISUAL_STYLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <label className={labelClass}>Hook (chamada principal)</label>
              <input value={hook} onChange={(e) => setHook(e.target.value)} className={inputClass} placeholder="Ex: FECHE 4 MENTORIAS POR SEMANA" />
            </div>
            <div className="mt-3">
              <label className={labelClass}>CTA (chamada para acao)</label>
              <input value={cta} onChange={(e) => setCta(e.target.value)} className={inputClass} placeholder="Ex: CLIQUE NO LINK DA BIO" />
            </div>
          </div>

          <div>
            <label className={labelClass}>Tags (separadas por virgula)</label>
            <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className={inputClass} placeholder="produto, ebook, servico" />
          </div>

          {error && <p className="text-sm text-accent-red">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSubmit}
              disabled={!file || !name || uploading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {analyzing ? "Analisando com IA..." : "Enviando..."}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Enviar Template
                </>
              )}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-200">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

