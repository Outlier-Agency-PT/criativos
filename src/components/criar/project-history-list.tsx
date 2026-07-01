"use client";


import { useState, useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";
import {
  Plus,
  Loader2,
  FolderOpen,
  Clock,
  ImageIcon,
  ChevronRight,
  RefreshCw,
  Copy,
  CheckCircle2,
  Trash2,
  Pencil,
  Download,
} from "lucide-react";

// PERF: formatDate Ã© chamada uma vez por projeto a cada render (~32x). toLocaleDateString
// Ã© caro (cria Intl.DateTimeFormat internamente). Memoizamos por string de data no
// mÃ³dulo: a mesma data nunca re-formata. O resultado Ã© determinÃ­stico (mesma data â†’
// mesmo texto), entÃ£o o cache Ã© seguro e nunca invalida.
const dateCache = new Map<string, string>();

function formatDate(dateStr: string): string {
  const cached = dateCache.get(dateStr);
  if (cached !== undefined) return cached;
  const formatted = new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  dateCache.set(dateStr, formatted);
  return formatted;
}

interface ProjectCreative {
  id: string;
  file_path: string | null;
  signed_url: string | null;
}

interface ProjectWithPreviews {
  id: string;
  name: string;
  status: string;
  total_creatives: number;
  created_at: string;
  current_step: number;
  previews: ProjectCreative[];
}

interface ProjectHistoryListProps {
  orgId: string;
  /** Abre a tela de escolha (Template vs Briefing). */
  onNewCreative: () => void;
  /** Abre um projeto existente no wizard (transiÃ§Ã£o por estado, nÃ£o por URL). */
  onOpenProject: (projectId: string) => void;
}

export function ProjectHistoryList({ orgId, onNewCreative, onOpenProject }: ProjectHistoryListProps) {
  const [projects, setProjects] = useState<ProjectWithPreviews[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [duplicatedId, setDuplicatedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    async function loadProjects() {
      const supabase = createBrowserSupabase();

      // Fetch all projects for this org, ordered by most recent
      // Tentar com current_step; se falhar (coluna nÃ£o existe), fazer sem
      let projectRows: Array<{
        id: string;
        name: string;
        status: string;
        total_creatives: number;
        created_at: string;
        current_step?: number;
      }> | null = null;
      let error: { message: string } | null = null;

      const res1 = await supabase
        .from("criativos_generation_projects")
        .select("id, name, status, total_creatives, created_at, current_step")
        .order("created_at", { ascending: false });

      if (res1.error) {
        // Fallback sem current_step (coluna pode nÃ£o existir ainda)
        const res2 = await supabase
          .from("criativos_generation_projects")
          .select("id, name, status, total_creatives, created_at")
          .order("created_at", { ascending: false });
        projectRows = res2.data;
        error = res2.error;
      } else {
        projectRows = res1.data;
        error = res1.error;
      }

      if (error || !projectRows) {
        setLoading(false);
        return;
      }

      // PERF: antes fazia N+1 (1 query + 4 signed URLs por projeto = ~120 chamadas
      // em sÃ©rie pra 24 projetos). Agora: 1 query traz criativos de TODOS os projetos,
      // e 1 chamada createSignedUrls gera todas as thumbnails de uma vez.
      const projectIds = projectRows.map((p) => p.id);
      const previewsByProject = new Map<string, ProjectCreative[]>();

      if (projectIds.length > 0) {
        const { data: allCreatives } = await supabase
          .from("criativos_creatives")
          .select("id, file_path, project_id, created_at")
          .in("project_id", projectIds)
          .eq("status", "completed")
          .not("file_path", "is", null)
          .order("created_at", { ascending: false });

        // atÃ© 4 previews por projeto
        const collected = new Map<string, { id: string; file_path: string }[]>();
        for (const c of allCreatives ?? []) {
          if (!c.project_id || !c.file_path) continue;
          const arr = collected.get(c.project_id) ?? [];
          if (arr.length < 4) arr.push({ id: c.id, file_path: c.file_path });
          collected.set(c.project_id, arr);
        }

        // 1 chamada pra todas as signed URLs
        const allPaths = [...new Set([...collected.values()].flat().map((c) => c.file_path))];
        const urlMap = new Map<string, string>();
        if (allPaths.length > 0) {
          const { data: signedList } = await supabase.storage
            .from("creatives")
            .createSignedUrls(allPaths, 3600);
          for (const s of signedList ?? []) {
            if (s.path && s.signedUrl) urlMap.set(s.path, s.signedUrl);
          }
        }

        for (const [pid, items] of collected) {
          previewsByProject.set(
            pid,
            items.map((c) => ({ id: c.id, file_path: c.file_path, signed_url: urlMap.get(c.file_path) ?? null })),
          );
        }
      }

      const projectsWithPreviews: ProjectWithPreviews[] = projectRows.map((project) => ({
        id: project.id,
        name: project.name || "Projeto sem nome",
        status: project.status,
        total_creatives: project.total_creatives ?? 0,
        created_at: project.created_at,
        current_step: project.current_step ?? 0,
        previews: previewsByProject.get(project.id) ?? [],
      }));

      setProjects(projectsWithPreviews);
      setLoading(false);
    }

    loadProjects();
  }, [orgId]);

  async function handleDuplicate(e: React.MouseEvent, projectId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (duplicatingId) return;

    setDuplicatingId(projectId);
    setDuplicatedId(null);
    try {
      const res = await fetch("/api/projects/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) throw new Error("Falha ao duplicar");

      const { projectId: newId, name } = await res.json();

      // Adicionar novo projeto no topo da lista
      setProjects((prev) => [
        {
          id: newId,
          name: name || "Projeto duplicado",
          status: "draft",
          total_creatives: 0,
          created_at: new Date().toISOString(),
          current_step: 0,
          previews: [],
        },
        ...prev,
      ]);

      setDuplicatedId(newId);
      setTimeout(() => setDuplicatedId(null), 3000);
    } catch {
      // Silencioso â€” poderia adicionar toast aqui
    } finally {
      setDuplicatingId(null);
    }
  }

  function handleRegenerate(e: React.MouseEvent, projectId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (openingId) return; // jÃ¡ estÃ¡ abrindo um â€” ignora cliques repetidos
    setOpeningId(projectId); // feedback visual + bloqueia duplo-clique
    onOpenProject(projectId); // transiÃ§Ã£o por estado (abre o wizard na hora)
  }

  async function handleDownload(e: React.MouseEvent, projectId: string, projectName: string) {
    e.preventDefault();
    e.stopPropagation();
    if (downloadingId) return;

    setDownloadingId(projectId);
    try {
      const res = await fetch(`/api/generate/download?projectId=${projectId}`);
      if (!res.ok) throw new Error("Falha ao baixar");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 60);
      a.download = `criativos-${safeName || projectId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silencioso
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(e: React.MouseEvent, projectId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (deletingId) return;

    const confirmed = window.confirm(
      "Tem certeza que deseja excluir este projeto? Todos os criativos gerados serao perdidos."
    );
    if (!confirmed) return;

    // OPTIMISTIC UPDATE: remove da UI IMEDIATAMENTE (sem esperar o servidor).
    // Se o DELETE falhar, restauramos o projeto na lista. Isso elimina a
    // sensaÃ§Ã£o de "travado" â€” o item some na hora do clique.
    const snapshot = projects;
    setProjects((prev) => prev.filter((p) => p.id !== projectId));

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Falha ao excluir");
    } catch {
      // Falhou: restaura a lista anterior (rollback do optimistic update).
      setProjects(snapshot);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Criar Criativos</h1>
          <p className="text-sm text-text-muted mt-1">
            {projects.length > 0
              ? (() => {
                  const incomplete = projects.filter((p) => p.status === "incomplete").length;
                  const complete = projects.length - incomplete;
                  const parts: string[] = [];
                  if (complete > 0) parts.push(`${complete} completo${complete !== 1 ? "s" : ""}`);
                  if (incomplete > 0) parts.push(`${incomplete} em andamento`);
                  return parts.join(" Â· ");
                })()
              : "Nenhum projeto ainda"}
          </p>
        </div>
        <button
          onClick={onNewCreative}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: "var(--gradient-cta)",
            color: "var(--surface-000)",
            boxShadow: "var(--glow-cta)",
          }}
        >
          <Plus className="w-4 h-4" />
          Novo Criativo
        </button>
      </div>

      {/* Empty state */}
      {projects.length === 0 ? (
        <div className="theme-panel text-center rounded-[26px] py-24">
          <FolderOpen className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Nenhum projeto criado
          </h2>
          <p className="text-sm text-text-muted mb-6 max-w-sm mx-auto">
            Comece criando seu primeiro projeto de criativos com nosso assistente passo a passo.
          </p>
          <button
            onClick={onNewCreative}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: "var(--gradient-cta)",
              color: "var(--surface-000)",
              boxShadow: "var(--glow-cta)",
            }}
          >
            <Plus className="w-4 h-4" />
            Criar Primeiro Projeto
          </button>
        </div>
      ) : (
        /* Project list */
        <div className="grid gap-3">
          {projects.map((project) => {
            const isIncomplete = project.status === "incomplete";
            const stepLabels = ["Configurar", "Copy", "Visual", "Gerar"];

            return (
            <div
              key={project.id}
              onClick={() => { if (!openingId) { setOpeningId(project.id); onOpenProject(project.id); } }}
              className={cn(
                "group flex items-center gap-4 p-4 rounded-xl border",
                isIncomplete
                  ? "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/50"
                  : "border-border-subtle bg-surface-050 hover:bg-surface-100 hover:border-border-default",
                openingId === project.id && "opacity-60 pointer-events-none",
                "transition-all cursor-pointer"
              )}
            >
              {/* Thumbnail previews â€” 2x2 grid */}
              <div className="flex-shrink-0 w-28 h-28 rounded-lg overflow-hidden bg-surface-100 grid grid-cols-2 grid-rows-2 gap-0.5">
                {isIncomplete ? (
                  <div className="col-span-2 row-span-2 flex flex-col items-center justify-center bg-surface-100">
                    <Pencil className="w-6 h-6 text-amber-500/60 mb-1" />
                    <span className="text-[10px] text-amber-500/80 font-medium">
                      {stepLabels[project.current_step] || "Rascunho"}
                    </span>
                  </div>
                ) : (
                  [0, 1, 2, 3].map((i) => {
                    const preview = project.previews[i];
                    return (
                      <div key={i} className="bg-surface-150 relative overflow-hidden">
                        {preview?.signed_url ? (
                          <img
                            src={preview.signed_url}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-text-muted/30" />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Project info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-text-primary truncate group-hover:text-accent-champagne transition-colors">
                    {project.name}
                  </h3>
                  {isIncomplete && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-medium flex-shrink-0">
                      <Pencil className="w-2.5 h-2.5" />
                      Incompleto
                    </span>
                  )}
                  {duplicatedId === project.id && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-green/10 text-accent-green text-[10px] font-medium flex-shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      Duplicado
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {isIncomplete ? (
                    <span className="flex items-center gap-1 text-xs text-amber-500/80">
                      <Clock className="w-3 h-3" />
                      Passo {project.current_step + 1}/4 â€” {stepLabels[project.current_step]}
                    </span>
                  ) : project.total_creatives > 0 ? (
                    <span className="flex items-center gap-1 text-xs text-text-secondary">
                      <ImageIcon className="w-3 h-3" />
                      {project.total_creatives} criativo{project.total_creatives !== 1 ? "s" : ""}
                    </span>
                  ) : null}
                  <span className="text-xs text-text-muted">
                    {formatDate(project.created_at)}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {isIncomplete ? (
                  <button
                    onClick={(e) => handleRegenerate(e, project.id)}
                    disabled={openingId === project.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 transition-colors disabled:opacity-60"
                  >
                    {openingId === project.id ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Abrindo...</>
                    ) : (
                      <><Pencil className="w-3.5 h-3.5" /> Continuar</>
                    )}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={(e) => handleRegenerate(e, project.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-accent-champagne hover:bg-champagne-alpha-10 transition-colors"
                      title="Gerar Novamente"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Gerar</span>
                    </button>
                    <button
                      onClick={(e) => handleDuplicate(e, project.id)}
                      disabled={duplicatingId === project.id}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-accent-champagne hover:bg-champagne-alpha-10 disabled:opacity-50 transition-colors"
                      title="Duplicar"
                    >
                      {duplicatingId === project.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">Duplicar</span>
                    </button>
                    {project.total_creatives > 0 && (
                      <button
                        onClick={(e) => handleDownload(e, project.id, project.name)}
                        disabled={downloadingId === project.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-accent-champagne hover:bg-champagne-alpha-10 disabled:opacity-50 transition-colors"
                        title="Baixar todas as imagens (ZIP)"
                      >
                        {downloadingId === project.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">Baixar</span>
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={(e) => handleDelete(e, project.id)}
                  disabled={deletingId === project.id}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-accent-red hover:bg-accent-red/10 disabled:opacity-50 transition-colors"
                  title="Excluir"
                >
                  {deletingId === project.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">Excluir</span>
                </button>
              </div>

              {/* Arrow */}
              <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-accent-champagne flex-shrink-0 transition-colors" />
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

