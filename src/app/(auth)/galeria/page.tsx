"use client";


import { useState, useEffect, useCallback, useRef } from "react";
import { Image, Filter, Loader2, ChevronLeft, ChevronRight, Check, Download } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { CreativeCard } from "@/components/gallery/creative-card";
import { CreativeDetailModal } from "@/components/gallery/creative-detail-modal";
import type { CreativeCardData } from "@/components/gallery/creative-card";

interface CreativeRow {
  id: string;
  status: string;
  file_path: string | null;
  template_id: string | null;
  copy_id: string | null;
  prompt_used: string | null;
  provider_used: string | null;
  model_used: string | null;
  generation_time_ms: number | null;
  error_message: string | null;
  created_at: string;
  project_id: string;
  generation_projects: { name: string } | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

type StatusFilter = "all" | "approved" | "completed" | "pending" | "error";

const PAGE_SIZE = 20;

export default function GaleriaPage() {
  const [creatives, setCreatives] = useState<(CreativeCardData & { prompt_used?: string | null; provider_used?: string | null; model_used?: string | null; generation_time_ms?: number | null; error_message?: string | null })[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedCreative, setSelectedCreative] = useState<typeof creatives[number] | null>(null);
  // SeleÃ§Ã£o para download em massa
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadingZip, setDownloadingZip] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleDownloadSelected() {
    if (selectedIds.size === 0 || downloadingZip) return;
    setDownloadingZip(true);
    const ids = [...selectedIds].join(",");
    window.open(`/api/generate/download?ids=${ids}`, "_blank");
    setTimeout(() => setDownloadingZip(false), 2000);
  }

  const loadCreatives = useCallback(async () => {
    setLoading(true);
    const supabase = createBrowserSupabase();

    // Contar total
    let countQuery = supabase
      .from("criativos_creatives")
      .select("*", { count: "exact", head: true });

    if (selectedProject !== "all") {
      countQuery = countQuery.eq("project_id", selectedProject);
    }
    if (statusFilter !== "all") {
      countQuery = countQuery.eq("status", statusFilter);
    }

    const { count } = await countQuery;
    setTotal(count ?? 0);

    // Buscar criativos com join no projeto
    let query = supabase
      .from("criativos_creatives")
      .select("id, status, file_path, template_id, copy_id, prompt_used, provider_used, model_used, generation_time_ms, error_message, created_at, project_id, criativos_generation_projects(name)")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (selectedProject !== "all") {
      query = query.eq("project_id", selectedProject);
    }
    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data } = await query;
    const rows = (data ?? []) as unknown as CreativeRow[];

    // Gerar signed URLs EM LOTE (1 round-trip) ao invÃ©s de N chamadas.
    const paths = rows
      .map((r) => r.file_path)
      .filter((p): p is string => Boolean(p));
    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signedList } = await supabase.storage
        .from("creatives")
        .createSignedUrls(paths, 3600);
      for (const s of signedList || []) {
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
      }
    }

    const withUrls = rows.map((row) => {
      const projectData = row.generation_projects;
      return {
        id: row.id,
        status: row.status as CreativeCardData["status"],
        file_path: row.file_path,
        signed_url: row.file_path ? urlByPath.get(row.file_path) ?? null : null,
        template_id: row.template_id,
        copy_id: row.copy_id,
        created_at: row.created_at,
        project_id: row.project_id,
        project_name: projectData?.name ?? undefined,
        prompt_used: row.prompt_used,
        provider_used: row.provider_used,
        model_used: row.model_used,
        generation_time_ms: row.generation_time_ms,
        error_message: row.error_message,
      };
    });

    setCreatives(withUrls);
    setLoading(false);
  }, [selectedProject, statusFilter, page]);

  useEffect(() => {
    // Carregar lista de projetos
    async function loadProjects() {
      const supabase = createBrowserSupabase();
      const { data } = await supabase
        .from("criativos_generation_projects")
        .select("id, name")
        .order("created_at", { ascending: false });
      if (data) {
        setProjects(data.map((p) => ({ id: p.id, name: p.name || "Projeto sem nome" })));
      }
    }
    loadProjects();
  }, []);

  useEffect(() => {
    loadCreatives();
  }, [loadCreatives]);

  // Reconciliar criativos Ã³rfÃ£os via /api/generate/status antes de repollar
  const reconcileStale = useCallback(async () => {
    const staleProjectIds = [
      ...new Set(
        creatives
          .filter((c) => c.status === "generating" && "project_id" in c)
          .map((c) => (c as unknown as { project_id: string }).project_id)
          .filter(Boolean)
      ),
    ];
    if (staleProjectIds.length === 0 && selectedProject !== "all" && creatives.some((c) => c.status === "generating")) {
      staleProjectIds.push(selectedProject);
    }
    await Promise.all(
      staleProjectIds.map((pid) =>
        fetch(`/api/generate/status?projectId=${pid}`).catch(() => {})
      )
    );
  }, [creatives, selectedProject]);

  // Polling: enquanto houver criativos em geraÃ§Ã£o, refetch a cada 3s
  useEffect(() => {
    if (loading) return;
    const hasInFlight = creatives.some(
      (c) => c.status === "pending" || c.status === "generating"
    );
    // TambÃ©m repolla se hÃ¡ completed sem signed_url (storage ainda propagando)
    const hasMissingUrl = creatives.some(
      (c) => (c.status === "completed" || c.status === "approved") && c.file_path && !c.signed_url
    );
    if (!hasInFlight && !hasMissingUrl) return;
    const interval = setInterval(async () => {
      if (hasInFlight) await reconcileStale();
      loadCreatives();
    }, 3000);
    return () => clearInterval(interval);
  }, [creatives, loading, loadCreatives, reconcileStale]);

  // Refetch ao voltar o foco para a aba (cobre o caso "voltei do wizard")
  // Recarrega ao voltar o foco â€” mas sÃ³ se passou >60s desde a Ãºltima carga.
  // (Antes: recarregava a galeria INTEIRA a cada foco, inclusive ao fechar um
  // modal, fazendo a pÃ¡gina "piscar"/recarregar sem necessidade.)
  const lastLoadRef = useRef(Date.now());
  useEffect(() => {
    function onFocus() {
      if (Date.now() - lastLoadRef.current > 60_000) {
        lastLoadRef.current = Date.now();
        loadCreatives();
      }
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadCreatives]);

  function handleFilterChange(project: string, status: StatusFilter) {
    setSelectedProject(project);
    setStatusFilter(status);
    setPage(0);
  }

  function handleStatusChange(id: string, newStatus: "approved" | "discarded") {
    setCreatives((prev) => prev.map((c) => c.id === id ? { ...c, status: newStatus } : c));
    if (selectedCreative?.id === id) {
      setSelectedCreative((prev) => prev ? { ...prev, status: newStatus } : null);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Image className="w-6 h-6" />
            Galeria
          </h1>
          <p className="text-text-secondary mt-1">
            {total} criativo{total !== 1 ? "s" : ""} no total
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="w-4 h-4 text-text-muted" />

        <select
          value={selectedProject}
          onChange={(e) => handleFilterChange(e.target.value, statusFilter)}
          className="px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
        >
          <option value="all">Todos os projetos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <div className="flex gap-1 bg-surface-100 rounded-lg p-1">
          {([
            { value: "all", label: "Todos" },
            { value: "approved", label: "Aprovados" },
            { value: "completed", label: "Pendentes" },
            { value: "error", label: "Erros" },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleFilterChange(selectedProject, opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? "bg-accent-champagne text-surface-000"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Barra de seleÃ§Ã£o / download em massa */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        {!selectionMode ? (
          <button
            onClick={() => setSelectionMode(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border-subtle text-text-secondary hover:border-border-default transition-colors"
          >
            <Check className="w-4 h-4" />
            Selecionar para baixar
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-text-secondary">{selectedIds.size} selecionado(s)</span>
            <button
              onClick={() => setSelectedIds(new Set(creatives.map((c) => c.id)))}
              className="px-3 py-1.5 rounded-lg text-xs border border-border-subtle text-text-muted hover:text-text-primary"
            >
              Selecionar todos
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 rounded-lg text-xs border border-border-subtle text-text-muted hover:text-text-primary"
            >
              Limpar
            </button>
            <button
              onClick={handleDownloadSelected}
              disabled={selectedIds.size === 0 || downloadingZip}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--gradient-cta)", color: "var(--surface-000)" }}
            >
              {downloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Baixar selecionados
            </button>
            <button
              onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
              className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Grade */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      ) : creatives.length === 0 ? (
        <div className="text-center py-24">
          <Image className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary">Nenhum criativo encontrado.</p>
          <p className="text-xs text-text-muted mt-1">Ajuste os filtros ou crie novos criativos.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {creatives.map((creative) => (
              <div key={creative.id} className="relative">
                <CreativeCard
                  creative={creative}
                  onClick={() =>
                    selectionMode ? toggleSelected(creative.id) : setSelectedCreative(creative)
                  }
                />
                {selectionMode && (
                  <button
                    onClick={() => toggleSelected(creative.id)}
                    className="absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center border-2 transition-colors"
                    style={{
                      background: selectedIds.has(creative.id) ? "var(--gradient-cta)" : "rgba(0,0,0,0.4)",
                      borderColor: selectedIds.has(creative.id) ? "transparent" : "rgba(255,255,255,0.6)",
                    }}
                    aria-label="Selecionar"
                  >
                    {selectedIds.has(creative.id) && <Check className="w-4 h-4" style={{ color: "var(--surface-000)" }} />}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Paginacao */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 rounded-lg bg-surface-100 text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-text-secondary">
                {page + 1} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 rounded-lg bg-surface-100 text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {selectedCreative && (
        <CreativeDetailModal
          creative={{
            ...selectedCreative,
            prompt_used: selectedCreative.prompt_used ?? null,
            provider_used: selectedCreative.provider_used ?? null,
            model_used: selectedCreative.model_used ?? null,
            generation_time_ms: selectedCreative.generation_time_ms ?? null,
            error_message: selectedCreative.error_message ?? null,
          }}
          onClose={() => setSelectedCreative(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}

