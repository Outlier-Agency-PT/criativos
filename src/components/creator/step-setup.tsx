"use client";


import { useState, useEffect, useCallback } from "react";
import { useCreator, type SelectedTemplate } from "./creator-context";
import { Loader2, CheckSquare, Square, AlertCircle, Search, CheckCircle2, X, ZoomIn, Star, Cpu, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { AI_MODELS, isImagenModel } from "@/lib/models";
import { Portal } from "./portal";

const MAX_TEMPLATES = 5;

const CATEGORY_FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "anuncio", label: "Anuncios" },
  { key: "post", label: "Posts" },
  { key: "story", label: "Stories" },
] as const;

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

const SIZE_OPTIONS = [
  { width: 1080, height: 1350, label: "Feed (1080x1350)", ratio: "4:5" },
  { width: 1080, height: 1920, label: "Story (1080x1920)", ratio: "9:16" },
  { width: 1080, height: 1080, label: "Quadrado (1080x1080)", ratio: "1:1" },
] as const;

interface TemplateCopyElement {
  type: string;
  text_found: string;
  position?: string;
}

interface TemplateItem {
  id: string;
  name: string;
  category: string;
  tags: string[];
  file_path: string;
  thumbnail_path: string | null;
  copy_elements: TemplateCopyElement[] | null;
  mini_prompt: string | null;
  is_active: boolean;
  is_favorite: boolean;
  rating: number | null;
  niche: string | null;
  offer_type: string | null;
  advertiser: string | null;
  source_format: string | null;
  imageUrl?: string | null;
}

export function StepSetup() {
  const { orgId, projectName, selectedTemplates, format, selectedFormats: rawFormats, preferredModel, updateProject } = useCreator();
  const selectedFormats = rawFormats ?? [];
  void format;
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("todos");
  const [nicheFilter, setNicheFilter] = useState<string | null>(null);
  const [offerFilter, setOfferFilter] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<TemplateItem | null>(null);
  // Onboarding educativo: card explicativo dispensÃ¡vel (lembra a escolha por usuÃ¡rio).
  const [showOnboarding, setShowOnboarding] = useState(true);
  useEffect(() => {
    try {
      setShowOnboarding(localStorage.getItem("criativos_onboarding_setup_dismissed") !== "1");
    } catch { /* localStorage indisponÃ­vel: mantÃ©m visÃ­vel */ }
  }, []);
  function dismissOnboarding() {
    setShowOnboarding(false);
    try { localStorage.setItem("criativos_onboarding_setup_dismissed", "1"); } catch { /* ignore */ }
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ orgId });
        if (categoryFilter !== "todos") params.set("category", categoryFilter);
        if (searchQuery) params.set("search", searchQuery);

        const res = await fetch(`/api/templates?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        // API jÃ¡ retorna imageUrl com signed URL (service key server-side)
        const activeTemplates = (data.templates ?? []).filter((t: TemplateItem) => t.is_active);
        setTemplates(activeTemplates);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar templates");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orgId, categoryFilter, searchQuery]);

  const isSelected = useCallback(
    (id: string) => selectedTemplates.some((t) => t.id === id),
    [selectedTemplates]
  );

  function toggleTemplate(tmpl: TemplateItem) {
    if (isSelected(tmpl.id)) {
      updateProject({
        selectedTemplates: selectedTemplates.filter((t) => t.id !== tmpl.id),
      });
    } else {
      if (selectedTemplates.length >= MAX_TEMPLATES) return;
      const newItem: SelectedTemplate = {
        id: tmpl.id,
        name: tmpl.name,
        category: tmpl.category,
        thumbnailUrl: tmpl.imageUrl ?? tmpl.thumbnail_path,
        copyElements: tmpl.copy_elements?.map((el) => ({
          key: el.type,
          label: el.text_found,
          type: el.type,
        })) ?? null,
      };
      updateProject({
        selectedTemplates: [...selectedTemplates, newItem],
      });
    }
  }

  // Aplicar filtros locais
  const filtered = templates.filter((t) => {
    if (nicheFilter && t.niche !== nicheFilter) return false;
    if (offerFilter && t.offer_type !== offerFilter) return false;
    if (formatFilter && t.source_format !== formatFilter) return false;
    if (ratingFilter && (!t.rating || t.rating < ratingFilter)) return false;
    return true;
  });

  // Separar favoritos primeiro
  const favoriteTemplates = filtered.filter((t) => t.is_favorite);
  const otherTemplates = filtered.filter((t) => !t.is_favorite);

  const hasActiveFilters = nicheFilter || offerFilter || formatFilter || ratingFilter;

  const categoryColors: Record<string, string> = {
    anuncio: "bg-blue-500/10 text-blue-400",
    post: "bg-green-500/10 text-green-400",
    story: "bg-purple-500/10 text-purple-400",
  };

  function renderTemplateCard(tmpl: TemplateItem) {
    const selected = isSelected(tmpl.id);
    const disabled = !selected && selectedTemplates.length >= MAX_TEMPLATES;
    return (
      <div
        key={tmpl.id}
        className={cn(
          "group relative flex flex-col border overflow-hidden transition-all",
          selected
            ? "border-accent-champagne ring-1 ring-accent-champagne bg-surface-000"
            : "border-border-subtle bg-surface-000 hover:border-border-default",
          disabled && "opacity-40"
        )}
      >
        <button
          type="button"
          onClick={() => setPreviewTemplate(tmpl)}
          className="relative aspect-[4/5] bg-surface-100 overflow-hidden cursor-zoom-in"
        >
          {tmpl.imageUrl ? (
            <img src={tmpl.imageUrl} alt={tmpl.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="flex items-center justify-center w-full h-full text-text-muted text-2xl">ðŸ“„</div>
          )}
          {/* Zoom icon on hover */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow" />
          </div>
          {/* Category badge */}
          <div className="absolute top-2 left-2">
            <span className={cn("px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm", categoryColors[tmpl.category] || "bg-gray-500/10 text-gray-400")}>
              {tmpl.category}
            </span>
          </div>
          {/* Favorite star */}
          {tmpl.is_favorite && !selected && (
            <div className="absolute top-2 right-2">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400 drop-shadow" />
            </div>
          )}
          {/* Selected overlay */}
          {selected && (
            <div className="absolute top-2 right-2">
              <CheckCircle2 className="w-5 h-5 text-accent-champagne drop-shadow" />
            </div>
          )}
        </button>
        <div className="flex items-center gap-2 p-2.5 text-left transition-colors hover:bg-surface-050">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (!disabled) toggleTemplate(tmpl);
            }}
            disabled={disabled}
            className={cn(
              "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border transition-colors",
              selected
                ? "border-accent-champagne bg-champagne-alpha-10"
                : "border-border-subtle bg-surface-050",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            {selected ? (
              <CheckSquare className="w-4 h-4 text-accent-champagne" />
            ) : (
              <Square className="w-4 h-4 text-text-muted" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-medium text-text-primary truncate">{tmpl.name}</h3>
            <div className="flex items-center gap-1">
              {tmpl.rating && tmpl.rating > 0 && (
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={cn("w-2.5 h-2.5", s <= (tmpl.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-surface-200")} />
                  ))}
                </div>
              )}
              <p className="text-[10px] text-text-muted">
                {tmpl.copy_elements?.length ?? 0} elementos
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Onboarding educativo (dispensÃ¡vel) â€” como o fluxo funciona */}
      {showOnboarding && (
        <div className="theme-panel rounded-[26px] p-4 lg:p-5 relative border border-accent-champagne/30">
          <button
            type="button"
            onClick={dismissOnboarding}
            aria-label="Dispensar dica"
            className="absolute top-3 right-3 p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-accent-champagne/10 text-accent-champagne flex-shrink-0">
              <Info className="w-4 h-4" />
            </div>
            <div className="space-y-2 pr-6">
              <h3 className="text-sm font-semibold text-text-primary">Como funciona em 3 passos</h3>
              <ol className="space-y-1.5 text-xs text-text-secondary list-decimal list-inside">
                <li>
                  <strong className="text-text-primary">Escolha os templates</strong>: a biblioteca tem modelos
                  prontos (incluindo o swipe file padrao). Cada template empresta o layout; o conteúdo vem da sua marca.
                </li>
                <li>
                  <strong className="text-text-primary">Monte a copy</strong>: nos proximos passos voce escreve ou usa
                  a biblioteca de copy (headlines, CTAs, descricoes). A copy define o texto de cada criativo.
                </li>
                <li>
                  <strong className="text-text-primary">Gere</strong>: na ultima etapa, clique em gerar. Cada criativo
                  consome credito de API. Acompanhe custo e consumo na pagina Uso.
                </li>
              </ol>
              <p className="text-[11px] text-text-muted">
                Dica: a primeira geracao costuma levar alguns segundos por imagem. Voce pode gerar mais a qualquer
                momento, sem apagar os anteriores.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="theme-panel rounded-[26px] p-4 lg:p-5">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted mb-2">
                Nome do projeto
              </label>
              <input
                value={projectName}
                onChange={(e) => updateProject({ projectName: e.target.value })}
                placeholder="Ex: Campanha de lancamento, Posts semana 12..."
                className="w-full px-4 py-3 rounded-xl bg-surface-100 border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-champagne"
              />
            </div>
            <p className="text-xs text-text-muted">
              Nomeie o projeto para localizar a configuraÃ§Ã£o e os criativos depois.
            </p>
          </div>
        </div>

        <div className="theme-panel rounded-[26px] p-4 lg:p-5">
          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted mb-2">
                Tamanho
              </h3>
              <p className="text-xs text-text-muted">
                Selecione um ou mais formatos. Criativos serao gerados em todos os tamanhos.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SIZE_OPTIONS.map((opt) => {
                const isSel = selectedFormats.some(
                  (f) => f.width === opt.width && f.height === opt.height
                );
                const maxH = 76;
                const scale = maxH / opt.height;
                const previewW = Math.round(opt.width * scale);
                const previewH = Math.round(opt.height * scale);

                return (
                  <button
                    key={opt.label}
                    onClick={() => {
                      let newFormats;
                      if (isSel) {
                        newFormats = selectedFormats.filter(
                          (f) => !(f.width === opt.width && f.height === opt.height)
                        );
                        if (newFormats.length === 0) return;
                      } else {
                        newFormats = [
                          ...selectedFormats,
                          { width: opt.width, height: opt.height, label: opt.label },
                        ];
                      }
                      updateProject({
                        selectedFormats: newFormats,
                        format: newFormats[0],
                      });
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 transition-all",
                      isSel
                        ? "border-accent-champagne bg-champagne-alpha-05"
                        : "border-border-subtle bg-surface-050 hover:border-border-default"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-md border-2 transition-colors",
                        isSel
                          ? "border-accent-champagne bg-champagne-alpha-10"
                          : "border-border-subtle bg-surface-100"
                      )}
                      style={{ width: previewW, height: previewH }}
                    />
                    <div className="text-center space-y-0.5">
                      <div className="flex items-center justify-center gap-1.5">
                        {isSel && <CheckCircle2 className="w-3.5 h-3.5 text-accent-champagne" />}
                        <span className="text-xs font-medium text-text-primary">{opt.ratio}</span>
                      </div>
                      <p className="text-[10px] text-text-muted">{opt.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedFormats.length > 1 && (
              <p className="text-xs text-accent-champagne">
                {selectedFormats.length} tamanhos selecionados, cada criativo sera gerado em todos os formatos
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Seletor de Modelo de IA */}
      <div className="theme-panel rounded-[26px] p-4 lg:p-5 space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-text-muted" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Modelo de IA
            </h3>
          </div>
          <p className="text-xs text-text-muted">
            Escolha o modelo para gerar os criativos deste projeto.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {AI_MODELS.map((m) => {
            const isActive = preferredModel === m.id || (!preferredModel && m.recommended);
            return (
              <button
                key={m.id}
                onClick={() => updateProject({ preferredModel: m.id })}
                className={cn(
                  "flex flex-col gap-1.5 rounded-2xl border px-4 py-3 text-left transition-all",
                  isActive
                    ? "border-accent-champagne bg-champagne-alpha-05 ring-1 ring-accent-champagne"
                    : "border-border-subtle bg-surface-050 hover:border-border-default"
                )}
              >
                <div className="flex items-center gap-2">
                  {m.recommended && <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />}
                  <span className="text-sm font-semibold text-text-primary">{m.name}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-text-muted">
                  <span className="text-accent-champagne font-medium">~${m.costPerImage.toFixed(3)}/img</span>
                  <span>Â·</span>
                  <span>{m.maxResolution}</span>
                  {m.supportsImageInput && <span>Â· Ref. visual</span>}
                </div>
                <p className="text-[11px] text-text-muted/70 leading-snug">{m.description}</p>
              </button>
            );
          })}
        </div>

        {preferredModel && isImagenModel(preferredModel) && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-300">
              <p className="font-medium">Imagen gera imagens apenas a partir de texto.</p>
              <p className="mt-0.5 text-amber-300/70">
                Templates, fotos e logo nao serao usados como referencia visual.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="theme-panel rounded-[26px] p-4 lg:p-5 space-y-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted mb-2">
              Templates
            </h3>
            <p className="text-xs text-text-muted">
              Selecione ate {MAX_TEMPLATES} templates para seus criativos.
            </p>
          </div>
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-text-primary">{selectedTemplates.length}</span>
            /{MAX_TEMPLATES} selecionados
            {filtered.length !== templates.length && (
              <span className="text-text-muted ml-2">Â· {filtered.length} de {templates.length} templates</span>
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-border-subtle/70 bg-surface-050/60 p-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar template..."
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-champagne"
            />
          </div>

          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1 flex-wrap">
                {CATEGORY_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setCategoryFilter(f.key)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      categoryFilter === f.key
                        ? "bg-accent-champagne text-surface-000"
                        : "bg-surface-100 text-text-muted hover:text-text-primary"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="hidden xl:block w-px bg-border-subtle mx-1" />

              <select
                value={nicheFilter || ""}
                onChange={(e) => setNicheFilter(e.target.value || null)}
                className="px-2.5 py-1.5 rounded-lg bg-surface-100 border border-border-subtle text-xs text-text-primary"
              >
                <option value="">Nicho</option>
                {NICHE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              <select
                value={offerFilter || ""}
                onChange={(e) => setOfferFilter(e.target.value || null)}
                className="px-2.5 py-1.5 rounded-lg bg-surface-100 border border-border-subtle text-xs text-text-primary"
              >
                <option value="">Oferta</option>
                {OFFER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              <select
                value={formatFilter || ""}
                onChange={(e) => setFormatFilter(e.target.value || null)}
                className="px-2.5 py-1.5 rounded-lg bg-surface-100 border border-border-subtle text-xs text-text-primary"
              >
                <option value="">Formato</option>
                {FORMAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              <select
                value={ratingFilter || ""}
                onChange={(e) => setRatingFilter(e.target.value ? Number(e.target.value) : null)}
                className="px-2.5 py-1.5 rounded-lg bg-surface-100 border border-border-subtle text-xs text-text-primary"
              >
                <option value="">Rating</option>
                <option value="3">3+ estrelas</option>
                <option value="4">4+ estrelas</option>
                <option value="5">5 estrelas</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={() => { setNicheFilter(null); setOfferFilter(null); setFormatFilter(null); setRatingFilter(null); }}
                className="px-2 py-1.5 rounded-lg text-xs text-text-muted hover:text-accent-red hover:bg-accent-red-dim transition-colors w-fit"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        {selectedTemplates.length >= MAX_TEMPLATES && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-champagne/10 text-accent-champagne text-xs">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            Maximo de {MAX_TEMPLATES} templates atingido
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          </div>
        ) : error ? (
          <p className="text-sm text-accent-red py-4">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-text-muted py-12">
            {searchQuery || hasActiveFilters
              ? "Nenhum template encontrado para estes filtros."
              : "Nenhum template encontrado. Adicione templates no Swipe File."}
          </p>
        ) : (
          <>
            {favoriteTemplates.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-amber-400/80 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  Favoritos ({favoriteTemplates.length})
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {favoriteTemplates.map(renderTemplateCard)}
                </div>
              </div>
            )}

            {otherTemplates.length > 0 && (
              <div className="space-y-2">
                {favoriteTemplates.length > 0 && (
                  <h4 className="text-xs font-medium text-text-muted">
                    Todos ({otherTemplates.length})
                  </h4>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {otherTemplates.map(renderTemplateCard)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de preview */}
      {previewTemplate && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80" onClick={() => setPreviewTemplate(null)}>
          <div
            className="relative flex flex-col items-center max-h-[95vh] w-full max-w-5xl mx-16"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top bar */}
            <div className="w-full flex items-center justify-between px-4 py-3 bg-surface-000/95 backdrop-blur-sm rounded-t-2xl border border-border-subtle border-b-0">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-text-primary truncate max-w-[300px]">
                  {previewTemplate.name}
                </h2>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Rating display */}
                {previewTemplate.rating && previewTemplate.rating > 0 && (
                  <div className="flex items-center gap-0.5 mr-3">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={cn("w-4 h-4", s <= (previewTemplate.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-surface-200")} />
                    ))}
                  </div>
                )}
                {/* Select/deselect button */}
                <button
                  onClick={() => {
                    if (!isSelected(previewTemplate.id)) {
                      if (selectedTemplates.length < MAX_TEMPLATES) toggleTemplate(previewTemplate);
                    } else {
                      toggleTemplate(previewTemplate);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    isSelected(previewTemplate.id)
                      ? "bg-accent-champagne text-surface-000"
                      : "bg-surface-100 text-text-primary hover:bg-surface-150"
                  )}
                >
                  {isSelected(previewTemplate.id) ? (
                    <><CheckSquare className="w-3.5 h-3.5" /> Selecionado</>
                  ) : (
                    <><Square className="w-3.5 h-3.5" /> Selecionar</>
                  )}
                </button>
                <button onClick={() => setPreviewTemplate(null)} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-100 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content: image + side panel */}
            <div className="w-full flex bg-surface-000 border border-border-subtle border-t-0 rounded-b-2xl overflow-hidden">
              {/* Image */}
              <div className="flex-1 flex items-center justify-center bg-surface-050 min-h-[50vh] max-h-[80vh] overflow-hidden">
                {previewTemplate.imageUrl ? (
                  <img src={previewTemplate.imageUrl} alt={previewTemplate.name} className="max-w-full max-h-[80vh] object-contain" />
                ) : (
                  <div className="flex items-center justify-center text-6xl text-text-muted">ðŸ“„</div>
                )}
              </div>

              {/* Details side panel */}
              <div className="w-80 border-l border-border-subtle overflow-y-auto max-h-[80vh] p-5 space-y-4">
                {/* Category badges */}
                <div className="flex gap-2 flex-wrap">
                  <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-surface-100 text-text-secondary">{previewTemplate.category}</span>
                  {previewTemplate.is_favorite && (
                    <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-amber-500/10 text-amber-400 flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current" /> Favorito
                    </span>
                  )}
                </div>

                {/* Metadata grid */}
                {(previewTemplate.advertiser || previewTemplate.niche || previewTemplate.offer_type || previewTemplate.source_format) && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 bg-surface-050 rounded-lg p-3">
                    {previewTemplate.advertiser && (
                      <div>
                        <span className="text-[10px] font-medium text-text-muted uppercase">Anunciante</span>
                        <p className="text-sm text-text-primary">@{previewTemplate.advertiser}</p>
                      </div>
                    )}
                    {previewTemplate.niche && (
                      <div>
                        <span className="text-[10px] font-medium text-text-muted uppercase">Nicho</span>
                        <p className="text-sm text-text-primary">{previewTemplate.niche}</p>
                      </div>
                    )}
                    {previewTemplate.offer_type && (
                      <div>
                        <span className="text-[10px] font-medium text-text-muted uppercase">Tipo de Oferta</span>
                        <p className="text-sm text-text-primary">{previewTemplate.offer_type}</p>
                      </div>
                    )}
                    {previewTemplate.source_format && (
                      <div>
                        <span className="text-[10px] font-medium text-text-muted uppercase">Formato</span>
                        <p className="text-sm text-text-primary">{previewTemplate.source_format}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Tags */}
                {previewTemplate.tags && previewTemplate.tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {previewTemplate.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 text-xs rounded bg-surface-100 text-text-muted">#{tag}</span>
                    ))}
                  </div>
                )}

                {/* Prompt */}
                {previewTemplate.mini_prompt && (
                  <div>
                    <h4 className="text-xs font-medium text-amber-400/80 mb-1.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      Prompt de Substituicao
                    </h4>
                    <p className="text-sm text-text-secondary bg-amber-500/5 border border-amber-500/10 p-3 rounded-lg leading-relaxed">{previewTemplate.mini_prompt}</p>
                  </div>
                )}

                {/* Copy elements */}
                {previewTemplate.copy_elements && previewTemplate.copy_elements.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-text-muted mb-2">Elementos detectados</h4>
                    <div className="space-y-1.5">
                      {previewTemplate.copy_elements.map((el, i) => (
                        <div key={i} className="flex gap-2 items-center text-sm">
                          <span className="px-2 py-0.5 text-xs rounded bg-surface-100 text-text-muted font-mono">{el.type}</span>
                          <span className="text-text-secondary truncate">{el.text_found}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </Portal>
      )}

    </div>
  );
}

