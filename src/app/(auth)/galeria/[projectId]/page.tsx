"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Image,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  Calendar,
  User,
  Palette,
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { CreativeCard } from "@/components/gallery/creative-card";
import { CreativeDetailModal } from "@/components/gallery/creative-detail-modal";
import type { CreativeCardData } from "@/components/gallery/creative-card";

interface ProjectInfo {
  id: string;
  name: string;
  status: string;
  created_at: string;
  persona_name: string | null;
  brand_kit_name: string | null;
}

type EnrichedCreative = CreativeCardData & {
  prompt_used?: string | null;
  provider_used?: string | null;
  model_used?: string | null;
  generation_time_ms?: number | null;
  error_message?: string | null;
};

export default function ProjectGalleryPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [creatives, setCreatives] = useState<EnrichedCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [selectedCreative, setSelectedCreative] = useState<EnrichedCreative | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createBrowserSupabase();

    // Buscar projeto com persona e brand kit
    const { data: proj } = await supabase
      .from("criativos_generation_projects")
      .select("id, name, status, created_at, persona:criativos_personas(name), brand_kit:criativos_brand_kits(name)")
      .eq("id", projectId)
      .single();

    if (proj) {
      // Supabase join pode retornar objeto ou array dependendo da relação
      const personaRaw = proj.persona as unknown;
      const brandRaw = proj.brand_kit as unknown;
      const personaData = Array.isArray(personaRaw) ? personaRaw[0] : personaRaw;
      const brandData = Array.isArray(brandRaw) ? brandRaw[0] : brandRaw;
      setProject({
        id: proj.id,
        name: proj.name || "Projeto sem nome",
        status: proj.status || "draft",
        created_at: proj.created_at,
        persona_name: (personaData as { name: string } | null)?.name ?? null,
        brand_kit_name: (brandData as { name: string } | null)?.name ?? null,
      });
    }

    // Buscar criativos
    const { data: rows } = await supabase
      .from("criativos_creatives")
      .select("id, status, file_path, template_id, copy_id, prompt_used, provider_used, model_used, generation_time_ms, error_message, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (rows) {
      // PERF: gera TODAS as signed URLs numa única chamada em lote
      // (createSignedUrls, plural) em vez de uma por criativo. Pra 20+ imagens,
      // isso vai de 20 requests sequenciais pra 1.
      const paths = rows.map((r) => r.file_path).filter((p): p is string => !!p);
      const signedByPath = new Map<string, string>();
      if (paths.length > 0) {
        const { data: signedList } = await supabase.storage
          .from("creatives")
          .createSignedUrls(paths, 3600);
        for (const s of signedList ?? []) {
          if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
        }
      }

      const withUrls = rows.map((row) => ({
        id: row.id,
        status: row.status as CreativeCardData["status"],
        file_path: row.file_path,
        signed_url: row.file_path ? signedByPath.get(row.file_path) ?? null : null,
        template_id: row.template_id,
        copy_id: row.copy_id,
        created_at: row.created_at,
        prompt_used: row.prompt_used,
        provider_used: row.provider_used,
        model_used: row.model_used,
        generation_time_ms: row.generation_time_ms,
        error_message: row.error_message,
      }));
      setCreatives(withUrls);
    }

    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reconciliar criativos órfãos via /api/generate/status
  const reconcileStale = useCallback(async () => {
    if (creatives.some((c) => c.status === "generating")) {
      await fetch(`/api/generate/status?projectId=${projectId}`).catch(() => {});
    }
  }, [creatives, projectId]);

  // Polling enquanto houver criativos em geração ou aguardando URL
  useEffect(() => {
    if (loading) return;
    const hasInFlight = creatives.some(
      (c) => c.status === "pending" || c.status === "generating"
    );
    const hasMissingUrl = creatives.some(
      (c) => (c.status === "completed" || c.status === "approved") && c.file_path && !c.signed_url
    );
    if (!hasInFlight && !hasMissingUrl) return;
    const interval = setInterval(async () => {
      if (hasInFlight) await reconcileStale();
      loadData();
    }, 3000);
    return () => clearInterval(interval);
  }, [creatives, loading, loadData, reconcileStale]);

  // Refetch ao voltar foco
  useEffect(() => {
    function onFocus() {
      loadData();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadData]);

  function handleStatusChange(id: string, newStatus: "approved" | "discarded") {
    setCreatives((prev) => prev.map((c) => c.id === id ? { ...c, status: newStatus } : c));
    if (selectedCreative?.id === id) {
      setSelectedCreative((prev) => prev ? { ...prev, status: newStatus } : null);
    }
  }

  async function handleDownloadAll() {
    setDownloading(true);
    try {
      const completedIds = creatives
        .filter((c) => c.status === "completed" || c.status === "approved")
        .map((c) => c.id);

      if (completedIds.length === 0) return;

      const res = await fetch("/api/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creativeIds: completedIds }),
      });

      if (!res.ok) throw new Error("Falha ao buscar URLs");

      const { urls } = await res.json();

      // Download individual de cada
      for (const item of urls as { id: string; url: string; filename: string }[]) {
        const a = document.createElement("a");
        a.href = item.url;
        a.download = item.filename;
        a.target = "_blank";
        a.click();
        // Pequeno delay entre downloads
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch {
      // Fallback silencioso
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-24">
        <p className="text-text-secondary">Projeto nao encontrado.</p>
        <Link href="/galeria" className="text-sm text-accent-champagne hover:underline mt-2 inline-block">
          Voltar para galeria
        </Link>
      </div>
    );
  }

  const totalCount = creatives.length;
  const approvedCount = creatives.filter((c) => c.status === "approved").length;
  const completedCount = creatives.filter((c) => c.status === "completed" || c.status === "approved").length;
  const errorCount = creatives.filter((c) => c.status === "error").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/galeria" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Voltar para galeria
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{project.name}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-text-muted">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {new Date(project.created_at).toLocaleDateString("pt-BR")}
              </span>
              {project.persona_name && (
                <span className="flex items-center gap-1.5">
                  <User className="w-4 h-4" />
                  {project.persona_name}
                </span>
              )}
              {project.brand_kit_name && (
                <span className="flex items-center gap-1.5">
                  <Palette className="w-4 h-4" />
                  {project.brand_kit_name}
                </span>
              )}
            </div>
          </div>

          {completedCount > 0 && (
            <button
              onClick={handleDownloadAll}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-champagne text-surface-000 text-sm font-medium hover:bg-accent-champagne/90 disabled:opacity-50 transition-colors"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download todos
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-surface-100 border border-border-subtle flex items-center gap-3">
          <Image className="w-5 h-5 text-blue-400" />
          <div>
            <p className="text-xl font-bold text-text-primary">{totalCount}</p>
            <p className="text-xs text-text-muted">Total</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-surface-100 border border-border-subtle flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400" />
          <div>
            <p className="text-xl font-bold text-text-primary">{approvedCount}</p>
            <p className="text-xs text-text-muted">Aprovados</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-surface-100 border border-border-subtle flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <div>
            <p className="text-xl font-bold text-text-primary">{errorCount}</p>
            <p className="text-xs text-text-muted">Erros</p>
          </div>
        </div>
      </div>

      {/* Grade */}
      {creatives.length === 0 ? (
        <div className="text-center py-24">
          <Image className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary">Nenhum criativo neste projeto ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {creatives.map((creative) => (
            <CreativeCard
              key={creative.id}
              creative={creative}
              onClick={() => setSelectedCreative(creative)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {selectedCreative && (
        <CreativeDetailModal
          creative={{
            ...selectedCreative,
            project_name: project.name,
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
