"use client";


import { useState, useEffect, useCallback } from "react";
import { Plus, Search, BookOpen, X, Star } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { TemplateCard } from "@/components/swipe-file/template-card";
import { TemplateDetailModal } from "@/components/swipe-file/template-detail-modal";
import { UploadTemplateModal } from "@/components/swipe-file/upload-template-modal";

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
  thumbnail_path: string | null;
  copy_elements: CopyElement[] | null;
  mini_prompt: string | null;
  is_system: boolean;
  is_active: boolean;
  is_favorite: boolean;
  rating: number | null;
  quality_status: string | null;
  imageUrl: string | null;
  niche: string | null;
  offer_type: string | null;
  advertiser: string | null;
  source_format: string | null;
  hook: string | null;
  cta: string | null;
  visual_style: string | null;
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

export default function SwipeFilePage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nicheFilter, setNicheFilter] = useState<string | null>(null);
  const [offerFilter, setOfferFilter] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [analyzingBatch, setAnalyzingBatch] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);

  async function runAnalyzeBatch() {
    if (!orgId || analyzingBatch) return;
    setAnalyzingBatch(true);
    setBatchResult(null);
    try {
      const res = await fetch("/api/templates/analyze-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, limit: 30 }),
      });
      const data = await res.json();
      if (res.ok) {
        setBatchResult(`${data.analyzed}/${data.total} analisados`);
        loadTemplates();
      } else {
        setBatchResult(`Erro: ${data.error}`);
      }
    } catch (err) {
      setBatchResult(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAnalyzingBatch(false);
      setTimeout(() => setBatchResult(null), 5000);
    }
  }

  const supabase = createBrowserSupabase();

  const loadTemplates = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    const params = new URLSearchParams({ orgId });
    if (search) params.set("search", search);

    try {
      const res = await fetch(`/api/templates?${params}`);
      const data = await res.json();

      if (data.templates) {
        setTemplates(data.templates);
      }
    } catch {
      // silenciar erro
    } finally {
      setLoading(false);
    }
  }, [orgId, search]);

  useEffect(() => {
    async function loadOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("organization_members")
        .select("org_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (membership) {
        setOrgId(membership.org_id);
        setIsAdmin(membership.role === "owner" || membership.role === "admin");
      }
    }
    loadOrg();
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  async function handleSave(id: string, data: Partial<Template>) {
    await fetch("/api/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    await loadTemplates();
    setSelectedTemplate(null);
  }

  async function handleToggleActive(id: string, active: boolean) {
    await fetch("/api/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: active }),
    });
    await loadTemplates();
    setSelectedTemplate(null);
  }

  async function handleToggleFavorite(id: string, favorite: boolean) {
    // Update local state immediately
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_favorite: favorite } : t))
    );
    // Persist
    await fetch("/api/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_favorite: favorite }),
    });
  }

  async function handleReplaceImage(id: string, file: File) {
    if (!orgId) return;
    const template = templates.find((t) => t.id === id);
    if (!template) return;

    try {
      // Upload new file via the API route (server-side auth)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", "templates");
      formData.append("replaceFile", template.file_path);
      const pathParts = template.file_path.split("/");
      const pathPrefix = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "";
      if (pathPrefix) formData.append("path", pathPrefix);

      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) {
        console.error("Erro ao fazer upload:", uploadData.error);
        return;
      }

      // Update template record with new file_path
      await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, file_path: uploadData.file_path }),
      });

      await loadTemplates();
      setSelectedTemplate(null);
    } catch (err) {
      console.error("Erro ao substituir imagem:", err);
    }
  }

  async function handleRate(id: string, newRating: number) {
    const ratingValue = newRating === 0 ? null : newRating;
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, rating: ratingValue } : t))
    );
    await fetch("/api/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, rating: ratingValue }),
    });
  }

  // Aplicar filtros localmente (niche, offer, format, rating)
  const filtered = templates.filter((t) => {
    if (nicheFilter && t.niche !== nicheFilter) return false;
    if (offerFilter && t.offer_type !== offerFilter) return false;
    if (formatFilter && t.source_format !== formatFilter) return false;
    if (ratingFilter && (!t.rating || t.rating < ratingFilter)) return false;
    return true;
  });

  const favoriteTemplates = filtered.filter((t) => t.is_active && t.is_favorite);
  const activeTemplates = filtered.filter((t) => t.is_active && !t.is_favorite);
  const inactiveTemplates = filtered.filter((t) => !t.is_active);

  const hasFilters = nicheFilter || offerFilter || formatFilter || ratingFilter;

  // Contagem por nicho para os badges
  const nicheCounts: Record<string, number> = {};
  const offerCounts: Record<string, number> = {};
  const formatCounts: Record<string, number> = {};
  for (const t of templates) {
    if (t.niche) nicheCounts[t.niche] = (nicheCounts[t.niche] || 0) + 1;
    if (t.offer_type) offerCounts[t.offer_type] = (offerCounts[t.offer_type] || 0) + 1;
    if (t.source_format) formatCounts[t.source_format] = (formatCounts[t.source_format] || 0) + 1;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Swipe File</h1>
          <p className="text-sm text-text-muted mt-1">
            {filtered.length} de {templates.length} template{templates.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runAnalyzeBatch}
            disabled={analyzingBatch || !orgId}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface-100 border border-border-subtle text-text-secondary text-xs font-medium hover:bg-surface-150 disabled:opacity-50"
            title="Analisa via IA todos os templates ainda não analisados (até 30 por vez)"
          >
            {analyzingBatch ? "Analisando..." : batchResult || "Analisar pendentes"}
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Template
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, tag ou anunciante..."
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-050 border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-champagne"
        />
      </div>

      {/* Filtros — V1 Cards por categoria */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Formato */}
        <div className="bg-surface-050 border border-border-subtle rounded-xl p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2.5">Formato</div>
          <div className="flex flex-wrap gap-1.5">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFormatFilter(formatFilter === opt.value ? null : opt.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  formatFilter === opt.value
                    ? "bg-accent-champagne text-surface-900"
                    : "bg-surface-100 text-text-muted hover:text-text-primary"
                }`}
              >
                {opt.label}
                {formatCounts[opt.value] ? ` (${formatCounts[opt.value]})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Rating */}
        <div className="bg-surface-050 border border-border-subtle rounded-xl p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2.5">Rating</div>
          <div className="flex flex-wrap gap-1.5">
            {[5, 4, 3, 2, 1].map((stars) => (
              <button
                key={stars}
                onClick={() => setRatingFilter(ratingFilter === stars ? null : stars)}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  ratingFilter === stars
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-surface-100 text-text-muted hover:text-text-primary"
                }`}
              >
                {stars}+ <Star className="w-3 h-3 fill-current" />
              </button>
            ))}
          </div>
        </div>

        {/* Nicho */}
        <div className="col-span-2 lg:col-span-1 bg-surface-050 border border-border-subtle rounded-xl p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2.5">Nicho</div>
          <div className="flex flex-wrap gap-1.5">
            {NICHE_OPTIONS.filter((o) => nicheCounts[o.value]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setNicheFilter(nicheFilter === opt.value ? null : opt.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  nicheFilter === opt.value
                    ? "bg-accent-champagne text-surface-900"
                    : "bg-surface-100 text-text-muted hover:text-text-primary"
                }`}
              >
                {opt.label} ({nicheCounts[opt.value]})
              </button>
            ))}
          </div>
        </div>

        {/* Oferta */}
        <div className="col-span-2 lg:col-span-1 bg-surface-050 border border-border-subtle rounded-xl p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2.5">Oferta</div>
          <div className="flex flex-wrap gap-1.5">
            {OFFER_OPTIONS.filter((o) => offerCounts[o.value]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setOfferFilter(offerFilter === opt.value ? null : opt.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  offerFilter === opt.value
                    ? "bg-accent-champagne text-surface-900"
                    : "bg-surface-100 text-text-muted hover:text-text-primary"
                }`}
              >
                {opt.label} ({offerCounts[opt.value]})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Limpar filtros */}
      {hasFilters && (
        <button
          onClick={() => { setNicheFilter(null); setOfferFilter(null); setFormatFilter(null); setRatingFilter(null); }}
          className="flex items-center gap-1 text-xs text-accent-champagne hover:underline"
        >
          <X className="w-3 h-3" />
          Limpar filtros
        </button>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] rounded-xl bg-surface-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-text-muted" />
          </div>
          {hasFilters ? (
            <>
              <h2 className="text-lg font-medium text-text-primary mb-1">Nenhum resultado</h2>
              <p className="text-sm text-text-muted mb-4">Ajuste os filtros para encontrar templates.</p>
              <button
                onClick={() => { setNicheFilter(null); setOfferFilter(null); setFormatFilter(null); }}
                className="px-4 py-2 rounded-lg bg-surface-100 text-text-primary text-sm font-medium hover:bg-surface-200 transition-colors"
              >
                Limpar filtros
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-medium text-text-primary mb-1">Nenhum template ainda</h2>
              <p className="text-sm text-text-muted mb-4">Suba o primeiro template para comecar!</p>
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Novo Template
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Favoritos */}
          {favoriteTemplates.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--text-accent)] mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 fill-current" />
                Favoritos ({favoriteTemplates.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-8">
                {favoriteTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    id={t.id}
                    name={t.name}
                    category={t.category}
                    tags={t.tags}
                    thumbnailUrl={t.imageUrl}
                    isSystem={t.is_system}
                    isActive={t.is_active}
                    isFavorite={t.is_favorite}
                    copyElements={t.copy_elements}
                    niche={t.niche}
                    offerType={t.offer_type}
                    advertiser={t.advertiser}
                    sourceFormat={t.source_format}
                    rating={t.rating}
                    onClick={() => setSelectedTemplate(t)}
                    onToggleFavorite={handleToggleFavorite}
                    onRate={handleRate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Templates ativos */}
          {activeTemplates.length > 0 && (
            <div>
              {favoriteTemplates.length > 0 && (
                <h3 className="text-sm font-medium text-[var(--text-muted)] mb-3">
                  Todos ({activeTemplates.length})
                </h3>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {activeTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    id={t.id}
                    name={t.name}
                    category={t.category}
                    tags={t.tags}
                    thumbnailUrl={t.imageUrl}
                    isSystem={t.is_system}
                    isActive={t.is_active}
                    isFavorite={t.is_favorite}
                    copyElements={t.copy_elements}
                    niche={t.niche}
                    offerType={t.offer_type}
                    advertiser={t.advertiser}
                    sourceFormat={t.source_format}
                    rating={t.rating}
                    onClick={() => setSelectedTemplate(t)}
                    onToggleFavorite={handleToggleFavorite}
                    onRate={handleRate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Templates inativos */}
          {inactiveTemplates.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--text-muted)] mb-3">Desativados ({inactiveTemplates.length})</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {inactiveTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    id={t.id}
                    name={t.name}
                    category={t.category}
                    tags={t.tags}
                    thumbnailUrl={t.imageUrl}
                    isSystem={t.is_system}
                    isActive={t.is_active}
                    isFavorite={t.is_favorite}
                    copyElements={t.copy_elements}
                    niche={t.niche}
                    offerType={t.offer_type}
                    advertiser={t.advertiser}
                    sourceFormat={t.source_format}
                    rating={t.rating}
                    onClick={() => setSelectedTemplate(t)}
                    onToggleFavorite={handleToggleFavorite}
                    onRate={handleRate}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {selectedTemplate && (() => {
        const allVisible = [...favoriteTemplates, ...activeTemplates, ...inactiveTemplates];
        const idx = allVisible.findIndex((t) => t.id === selectedTemplate.id);
        return (
          <TemplateDetailModal
            template={selectedTemplate}
            onClose={() => setSelectedTemplate(null)}
            onSave={handleSave}
            onToggleActive={handleToggleActive}
            onRate={handleRate}
            onReplaceImage={handleReplaceImage}
            isAdmin={isAdmin}
            currentIndex={idx >= 0 ? idx : undefined}
            totalCount={allVisible.length}
            onPrev={idx > 0 ? () => setSelectedTemplate(allVisible[idx - 1]) : undefined}
            onNext={idx < allVisible.length - 1 ? () => setSelectedTemplate(allVisible[idx + 1]) : undefined}
          />
        );
      })()}

      {showUpload && orgId && (
        <UploadTemplateModal
          orgId={orgId}
          onClose={() => setShowUpload(false)}
          onUploaded={loadTemplates}
        />
      )}
    </div>
  );
}

