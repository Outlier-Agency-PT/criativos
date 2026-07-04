"use client";


import { useState, useEffect, useCallback, useRef } from "react";
import { X, Edit2, Save, Trash2, ToggleLeft, ToggleRight, Star, ChevronLeft, ChevronRight, Info, ImagePlus } from "lucide-react";

interface CopyElement {
  type: string;
  text_found: string;
  position?: string;
}

interface Template {
  id: string;
  name: string;
  category: string;
  tags: string[];
  file_path: string;
  imageUrl: string | null;
  copy_elements: CopyElement[] | null;
  mini_prompt: string | null;
  is_system: boolean;
  is_active: boolean;
  niche?: string | null;
  offer_type?: string | null;
  advertiser?: string | null;
  source_format?: string | null;
  hook?: string | null;
  cta?: string | null;
  visual_style?: string | null;
  rating?: number | null;
  quality_status?: string | null;
}

interface TemplateDetailModalProps {
  template: Template;
  onClose: () => void;
  onSave: (id: string, data: Partial<Template>) => Promise<void>;
  onToggleActive: (id: string, active: boolean) => Promise<void>;
  onRate?: (id: string, rating: number) => void;
  onReplaceImage?: (id: string, file: File) => Promise<void>;
  onDelete?: (id: string) => void;
  isAdmin?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  currentIndex?: number;
  totalCount?: number;
}

export function TemplateDetailModal({
  template,
  onClose,
  onSave,
  onToggleActive,
  onRate,
  onReplaceImage,
  onDelete,
  isAdmin = false,
  onPrev,
  onNext,
  currentIndex,
  totalCount,
}: TemplateDetailModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState(template.category);
  const [tagsInput, setTagsInput] = useState(template.tags.join(", "));
  const [miniPrompt, setMiniPrompt] = useState(template.mini_prompt || "");
  const [elements, setElements] = useState<CopyElement[]>(template.copy_elements || []);
  const [advertiser, setAdvertiser] = useState(template.advertiser || "");
  const [niche, setNiche] = useState(template.niche || "");
  const [offerType, setOfferType] = useState(template.offer_type || "");
  const [sourceFormat, setSourceFormat] = useState(template.source_format || "");
  const [visualStyle, setVisualStyle] = useState(template.visual_style || "");
  const [hook, setHook] = useState(template.hook || "");
  const [cta, setCta] = useState(template.cta || "");
  const [saving, setSaving] = useState(false);

  const canEdit = !template.is_system;

  // Reset edit state when template changes (navigation)
  useEffect(() => {
    setEditing(false);
    setName(template.name);
    setCategory(template.category);
    setTagsInput(template.tags.join(", "));
    setMiniPrompt(template.mini_prompt || "");
    setElements(template.copy_elements || []);
    setAdvertiser(template.advertiser || "");
    setNiche(template.niche || "");
    setOfferType(template.offer_type || "");
    setSourceFormat(template.source_format || "");
    setVisualStyle(template.visual_style || "");
    setHook(template.hook || "");
    setCta(template.cta || "");
  }, [template.id]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (editing) return;
      if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [editing, onPrev, onNext, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(template.id, {
        name,
        category,
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
        mini_prompt: miniPrompt || null,
        copy_elements: elements,
        advertiser: advertiser || null,
        niche: niche || null,
        offer_type: offerType || null,
        source_format: sourceFormat || null,
        visual_style: visualStyle || null,
        hook: hook || null,
        cta: cta || null,
      } as Partial<Template>);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function updateElement(index: number, field: keyof CopyElement, value: string) {
    const updated = [...elements];
    updated[index] = { ...updated[index], [field]: value };
    setElements(updated);
  }

  function removeElement(index: number) {
    setElements(elements.filter((_, i) => i !== index));
  }

  function addElement() {
    setElements([...elements, { type: "other", text_found: "", position: "" }]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      {/* Prev arrow */}
      {onPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-50 w-12 h-12 flex items-center justify-center rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}

      {/* Next arrow */}
      {onNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-50 w-12 h-12 flex items-center justify-center rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}

      {/* Main content */}
      <div
        className="relative flex flex-col items-center max-h-[95vh] w-full max-w-5xl mx-16"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="w-full flex items-center justify-between px-4 py-3 bg-surface-000/95 backdrop-blur-sm rounded-t-2xl border border-border-subtle border-b-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-text-primary truncate max-w-[300px]">
              {template.name}
            </h2>
            {currentIndex != null && totalCount != null && (
              <span className="text-xs text-text-muted">
                {currentIndex + 1} / {totalCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {/* Rating stars */}
            {onRate && (
              <div className="flex items-center gap-0.5 mr-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => onRate(template.id, star === template.rating ? 0 : star)}
                    className="p-0.5 hover:scale-110 transition-transform"
                    title={`${star} estrela${star > 1 ? "s" : ""}`}
                  >
                    <Star
                      className={`w-5 h-5 ${
                        template.rating && star <= template.rating
                          ? "fill-amber-400 text-amber-400"
                          : "text-surface-200 hover:text-amber-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className={`p-2 rounded-lg transition-colors ${showDetails ? "bg-accent-champagne/20 text-accent-champagne" : "text-text-muted hover:text-text-primary hover:bg-surface-100"}`}
              title="Detalhes"
            >
              <Info className="w-4 h-4" />
            </button>
            {canEdit && !editing && (
              <button onClick={() => { setEditing(true); setShowDetails(true); }} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-100 transition-colors" title="Editar">
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => onToggleActive(template.id, !template.is_active)} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-100 transition-colors" title={template.is_active ? "Desativar" : "Reativar"}>
              {template.is_active ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
            {onDelete && (
              <button onClick={() => onDelete(template.id)} className="p-2 rounded-lg text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors" title="Excluir template">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-100 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content: image + optional side panel */}
        <div className="w-full flex bg-surface-000 border border-border-subtle border-t-0 rounded-b-2xl overflow-hidden">
          {/* Image — big, centered */}
          <div className="relative group/img flex-1 flex items-center justify-center bg-surface-050 min-h-[50vh] max-h-[80vh] overflow-hidden">
            {template.imageUrl ? (
              <img
                src={template.imageUrl}
                alt={template.name}
                className="max-w-full max-h-[80vh] object-contain"
              />
            ) : (
              <div className="flex items-center justify-center text-6xl text-text-muted">📄</div>
            )}
            {/* Replace image button */}
            {onReplaceImage && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setReplacing(true);
                    try {
                      await onReplaceImage(template.id, file);
                    } finally {
                      setReplacing(false);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={replacing}
                  className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-black/60 text-white text-xs font-medium opacity-0 group-hover/img:opacity-100 hover:bg-black/80 transition-all disabled:opacity-50"
                >
                  <ImagePlus className="w-4 h-4" />
                  {replacing ? "Substituindo..." : "Substituir imagem"}
                </button>
              </>
            )}
          </div>

          {/* Details side panel */}
          {showDetails && (
            <div className="w-80 border-l border-border-subtle overflow-y-auto max-h-[80vh] p-5 space-y-4">
              {editing ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Nome</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Categoria</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne">
                      <option value="anuncio">Anuncio</option>
                      <option value="post">Post</option>
                      <option value="story">Story</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Tags (separadas por virgula)</label>
                    <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne" />
                  </div>

                  {/* Metadados */}
                  <div className="pt-2 border-t border-border-subtle space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Metadados</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-text-muted mb-0.5">Anunciante</label>
                        <input value={advertiser} onChange={(e) => setAdvertiser(e.target.value)} className="w-full px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-xs text-text-primary" placeholder="@perfil" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-text-muted mb-0.5">Nicho</label>
                        <select value={niche} onChange={(e) => setNiche(e.target.value)} className="w-full px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-xs text-text-primary">
                          <option value="">—</option>
                          <option value="high_ticket">High Ticket</option>
                          <option value="infoprodutos">Infoprodutos</option>
                          <option value="vendas">Vendas</option>
                          <option value="marketing">Marketing</option>
                          <option value="gestao">Gestao</option>
                          <option value="ia">IA</option>
                          <option value="trafego">Trafego</option>
                          <option value="educacao">Educacao</option>
                          <option value="financeiro">Financeiro</option>
                          <option value="saude">Saude</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-text-muted mb-0.5">Tipo de Oferta</label>
                        <select value={offerType} onChange={(e) => setOfferType(e.target.value)} className="w-full px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-xs text-text-primary">
                          <option value="">—</option>
                          <option value="mentoria">Mentoria</option>
                          <option value="curso">Curso</option>
                          <option value="evento">Evento</option>
                          <option value="lead_magnet">Lead Magnet</option>
                          <option value="playbook">Playbook</option>
                          <option value="consultoria">Consultoria</option>
                          <option value="software">Software</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-text-muted mb-0.5">Formato</label>
                        <select value={sourceFormat} onChange={(e) => setSourceFormat(e.target.value)} className="w-full px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-xs text-text-primary">
                          <option value="">—</option>
                          <option value="story">Story</option>
                          <option value="feed">Feed</option>
                          <option value="carrossel">Carrossel</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-medium text-text-muted mb-0.5">Estilo Visual</label>
                        <select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} className="w-full px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-xs text-text-primary">
                          <option value="">—</option>
                          <option value="minimalista">Minimalista</option>
                          <option value="bold">Bold / Impactante</option>
                          <option value="editorial">Editorial</option>
                          <option value="fotografico">Fotografico</option>
                          <option value="ilustrado">Ilustrado</option>
                          <option value="corporativo">Corporativo</option>
                          <option value="dark">Dark / Escuro</option>
                          <option value="colorido">Colorido</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-text-muted mb-0.5">Hook</label>
                      <input value={hook} onChange={(e) => setHook(e.target.value)} className="w-full px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-xs text-text-primary" placeholder="Chamada principal do anuncio" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-text-muted mb-0.5">CTA</label>
                      <input value={cta} onChange={(e) => setCta(e.target.value)} className="w-full px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-xs text-text-primary" placeholder="Chamada para acao" />
                    </div>
                  </div>

                  {isAdmin && (
                    <div>
                      <label className="block text-xs font-medium text-amber-400/80 mb-1">Prompt de Substituicao (admin)</label>
                      <textarea value={miniPrompt} onChange={(e) => setMiniPrompt(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-amber-500/20 text-text-primary text-sm focus:outline-none focus:border-amber-500/40 resize-none" placeholder="Instrucoes de como substituir os elementos deste template..." />
                    </div>
                  )}

                  {/* Copy elements */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-text-muted">Elementos de Copy</label>
                      <button onClick={addElement} className="text-xs text-accent-champagne hover:underline">+ Adicionar</button>
                    </div>
                    <div className="space-y-2">
                      {elements.map((el, i) => (
                        <div key={i} className="flex gap-1.5 items-start">
                          <select value={el.type} onChange={(e) => updateElement(i, "type", e.target.value)} className="w-24 px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-xs text-text-primary">
                            <option value="headline">headline</option>
                            <option value="mini_copy">mini_copy</option>
                            <option value="list_items">list_items</option>
                            <option value="cta">cta</option>
                            <option value="subtitle">subtitle</option>
                            <option value="quote">quote</option>
                            <option value="other">other</option>
                          </select>
                          <input value={el.text_found} onChange={(e) => updateElement(i, "text_found", e.target.value)} placeholder="Texto" className="flex-1 px-2 py-1.5 rounded bg-surface-100 border border-border-subtle text-xs text-text-primary" />
                          <button onClick={() => removeElement(i)} className="p-1.5 text-text-muted hover:text-accent-red">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90 disabled:opacity-50">
                      <Save className="w-4 h-4" />
                      {saving ? "Salvando..." : "Salvar"}
                    </button>
                    <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-200">
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex gap-2 flex-wrap">
                    <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-surface-100 text-text-secondary">{category}</span>
                    {template.is_system && (
                      <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-accent-champagne/20 text-accent-champagne">Sistema</span>
                    )}
                    {!template.is_active && (
                      <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-red-500/10 text-red-400">Desativado</span>
                    )}
                  </div>

                  {/* Metadata */}
                  {(template.advertiser || template.niche || template.offer_type || template.hook || template.cta || template.visual_style) && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 bg-surface-050 rounded-lg p-3">
                      {template.advertiser && (
                        <div>
                          <span className="text-[10px] font-medium text-text-muted uppercase">Anunciante</span>
                          <p className="text-sm text-text-primary">@{template.advertiser}</p>
                        </div>
                      )}
                      {template.niche && (
                        <div>
                          <span className="text-[10px] font-medium text-text-muted uppercase">Nicho</span>
                          <p className="text-sm text-text-primary">{template.niche}</p>
                        </div>
                      )}
                      {template.offer_type && (
                        <div>
                          <span className="text-[10px] font-medium text-text-muted uppercase">Tipo de Oferta</span>
                          <p className="text-sm text-text-primary">{template.offer_type}</p>
                        </div>
                      )}
                      {template.source_format && (
                        <div>
                          <span className="text-[10px] font-medium text-text-muted uppercase">Formato</span>
                          <p className="text-sm text-text-primary">{template.source_format}</p>
                        </div>
                      )}
                      {template.visual_style && (
                        <div>
                          <span className="text-[10px] font-medium text-text-muted uppercase">Estilo Visual</span>
                          <p className="text-sm text-text-primary">{template.visual_style}</p>
                        </div>
                      )}
                      {template.hook && (
                        <div className="col-span-2">
                          <span className="text-[10px] font-medium text-text-muted uppercase">Hook</span>
                          <p className="text-sm text-text-primary">{template.hook}</p>
                        </div>
                      )}
                      {template.cta && (
                        <div className="col-span-2">
                          <span className="text-[10px] font-medium text-text-muted uppercase">CTA</span>
                          <p className="text-sm text-text-primary">{template.cta}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {template.tags.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {template.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 text-xs rounded bg-surface-100 text-text-muted">#{tag}</span>
                      ))}
                    </div>
                  )}

                  {template.mini_prompt && (
                    <div>
                      <h4 className="text-xs font-medium text-amber-400/80 mb-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                        Prompt de Substituição
                      </h4>
                      <p className="text-sm text-text-secondary bg-amber-500/5 border border-amber-500/10 p-3 rounded-lg leading-relaxed">{template.mini_prompt}</p>
                    </div>
                  )}

                  {elements.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-text-muted mb-2">Elementos detectados</h4>
                      <div className="space-y-1.5">
                        {elements.map((el, i) => (
                          <div key={i} className="flex gap-2 items-center text-sm">
                            <span className="px-2 py-0.5 text-xs rounded bg-surface-100 text-text-muted font-mono">{el.type}</span>
                            <span className="text-text-secondary truncate">{el.text_found}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Navigation hint */}
        {(onPrev || onNext) && (
          <div className="mt-2 text-xs text-white/40 text-center">
            Use as setas do teclado para navegar
          </div>
        )}
      </div>
    </div>
  );
}

