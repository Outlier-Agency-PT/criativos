"use client";


import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCreator } from "./creator-context";
import { EditCreativeModal } from "./edit-creative-modal";
import { Portal } from "./portal";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";
import {
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  ThumbsUp,
  Plus,
  Archive,
  RotateCcw,
  Save,
  Edit2,
} from "lucide-react";

interface CreativeResult {
  id: string;
  status: "pending" | "generating" | "completed" | "error" | "approved" | "discarded";
  template_id: string;
  copy_id: string;
  file_path: string | null;
  error_message: string | null;
}

function mapLoadedCreativesToResults(loadedCreatives: ReturnType<typeof useCreator>["loadedCreatives"]): CreativeResult[] {
  return loadedCreatives.map((creative) => ({
    id: creative.id,
    status: creative.status as CreativeResult["status"],
    template_id: "",
    copy_id: "",
    file_path: creative.signed_url || creative.file_path,
    error_message: creative.error_message,
  }));
}

async function fetchCreativeImageUrl(creativeId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/creatives/${creativeId}/image`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
}

export function StepResult() {
  const { projectId, projectName, setStep, updateProject, reset, loadedCreatives } = useCreator();
  const router = useRouter();
  const [creatives, setCreatives] = useState<CreativeResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);
  const [editingCreative, setEditingCreative] = useState<{ id: string; imageUrl: string | null; label: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function syncFromStatus() {
      if (!projectId) return;

      try {
        const res = await fetch(`/api/generate/status?projectId=${projectId}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!isMounted) return;

        const itemsWithUrls = await Promise.all(
          (data.items ?? []).map(async (item: { id: string; status: string; error?: string }) => ({
            ...item,
            imageUrl: item.status === "completed" || item.status === "approved"
              ? await fetchCreativeImageUrl(item.id)
              : null,
          }))
        );
        if (!isMounted) return;

        setCreatives(
          itemsWithUrls.map((item) => ({
            id: item.id,
            status: item.status as CreativeResult["status"],
            template_id: "",
            copy_id: "",
            file_path: item.imageUrl,
            error_message: item.error || null,
          }))
        );
        setError(null);

        if (!data.done) {
          pollTimer = setTimeout(syncFromStatus, 2000);
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar resultados");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (loadedCreatives.length > 0) {
      setCreatives(mapLoadedCreativesToResults(loadedCreatives));
      setLoading(false);
    }

    if (projectId) {
      void syncFromStatus();
      return () => {
        isMounted = false;
        if (pollTimer) clearTimeout(pollTimer);
      };
    }

    if (loadedCreatives.length === 0) {
      setLoading(false);
    }

    return () => {
      isMounted = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [projectId, loadedCreatives]);

  function updateStatus(id: string, status: "approved" | "discarded") {
    setCreatives((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status } : c))
    );
  }

  async function handleDownloadAll() {
    if (!projectId) return;
    setDownloadingAll(true);
    try {
      const res = await fetch(`/api/generate/download?projectId=${projectId}`);
      if (!res.ok) throw new Error("Falha no download");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `criativos-${projectId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Download individual como fallback
      setError("Download em lote nao disponivel. Use download individual.");
    } finally {
      setDownloadingAll(false);
    }
  }

  function handleDownloadSingle(creative: CreativeResult) {
    if (!creative.file_path) return;
    const a = document.createElement("a");
    a.href = creative.file_path;
    a.download = `criativo-${creative.id}.png`;
    a.click();
  }

  async function handleSave() {
    if (!projectId) return;
    setSaving(true);
    try {
      // 1. Update project status to 'completed'
      const supabase = createBrowserSupabase();
      const { error: updateError } = await supabase
        .from("criativos_generation_projects")
        .update({ status: "completed" })
        .eq("id", projectId);
      if (updateError) throw updateError;

      // 2. Delete the draft
      await fetch("/api/creator-draft", { method: "DELETE" }).catch(() => {});

      // 3. Navigate back to history list
      router.push("/criar");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar projeto");
      setSaving(false);
    }
  }

  const completed = creatives.filter((c) => c.status === "completed" || c.status === "approved");
  const errors = creatives.filter((c) => c.status === "error");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error && creatives.length === 0) {
    return <p className="text-sm text-accent-red py-8 text-center">{error}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            {projectName?.trim() || "Criativos Gerados"}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            {completed.length} concluidos, {errors.length} erros de {creatives.length} total
          </p>
        </div>
        <div className="flex gap-2">
          {completed.length > 0 && (
            <button
              onClick={handleDownloadAll}
              disabled={downloadingAll}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-150 disabled:opacity-50"
            >
              {downloadingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              Download ZIP
            </button>
          )}
          <button
            onClick={() => {
              setStep(3);
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-champagne text-surface-000 text-sm font-semibold hover:bg-accent-champagne/90"
            title="Volta pra tela de gerar e ACRESCENTA novos criativos (os atuais sÃ£o mantidos)"
          >
            <RotateCcw className="w-4 h-4" />
            Gerar mais
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-accent-red">{error}</p>}

      {/* Grade de criativos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {creatives.map((creative) => (
          <div
            key={creative.id}
            className={cn(
              "relative rounded-xl border overflow-hidden",
              creative.status === "approved"
                ? "border-accent-green"
                : creative.status === "discarded"
                  ? "border-accent-red opacity-50"
                  : creative.status === "error"
                    ? "border-accent-red"
                    : "border-border-subtle"
            )}
          >
            {/* Preview */}
            <div className="aspect-[4/5] bg-surface-100 relative">
              {creative.file_path && creative.status !== "error" ? (
                <button
                  type="button"
                  onClick={() => setPreviewImage({ url: creative.file_path!, label: `Criativo ${creative.id}` })}
                  className="block h-full w-full cursor-zoom-in"
                >
                  <img
                    src={creative.file_path}
                    alt={`Criativo ${creative.id}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ) : creative.status === "error" ? (
                <div className="flex flex-col items-center justify-center w-full h-full gap-2 p-4">
                  <XCircle className="w-8 h-8 text-accent-red" />
                  <p className="text-xs text-accent-red text-center">
                    {creative.error_message || "Erro na geracao"}
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center w-full h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
                </div>
              )}

              {/* Status badge */}
              <div className="absolute top-2 left-2">
                {creative.status === "completed" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-green/20 text-accent-green backdrop-blur-sm">
                    Concluido
                  </span>
                )}
                {creative.status === "approved" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-green/30 text-accent-green backdrop-blur-sm flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Aprovado
                  </span>
                )}
                {creative.status === "discarded" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-red/20 text-accent-red backdrop-blur-sm">
                    Descartado
                  </span>
                )}
                {creative.status === "error" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-red/20 text-accent-red backdrop-blur-sm">
                    Erro
                  </span>
                )}
              </div>
            </div>

            {/* Acoes */}
            {creative.status !== "error" && creative.status !== "discarded" && (
              <div className="flex border-t border-border-subtle">
                <button
                  onClick={() => updateStatus(creative.id, "approved")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1 py-2 text-xs transition-colors",
                    creative.status === "approved"
                      ? "text-accent-green bg-accent-green/10"
                      : "text-text-muted hover:text-accent-green hover:bg-accent-green/5"
                  )}
                  title="Aprovar"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditingCreative({ id: creative.id, imageUrl: creative.file_path, label: `Criativo ${creative.id}` })}
                  className="flex-1 flex items-center justify-center gap-1 py-2 text-xs text-text-muted hover:text-text-primary hover:bg-surface-100 transition-colors border-r border-border-subtle"
                  title="Editar imagem"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDownloadSingle(creative)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 text-xs text-text-muted hover:text-text-primary hover:bg-surface-100 transition-colors border-x border-border-subtle"
                  title="Download"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => updateStatus(creative.id, "discarded")}
                  className="flex-1 flex items-center justify-center gap-1 py-2 text-xs text-text-muted hover:text-accent-red hover:bg-accent-red/5 transition-colors"
                  title="Descartar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sticky bottom bar */}
      {completed.length > 0 && (
        <div className="sticky bottom-4 z-30 flex items-center justify-between bg-surface-000/95 backdrop-blur-sm border border-border-subtle rounded-xl px-4 py-3 shadow-lg">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-surface-100 text-text-secondary text-sm font-medium hover:bg-surface-150"
          >
            <Plus className="w-4 h-4" />
            Novo projeto
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-accent-champagne text-surface-000 text-sm font-semibold hover:bg-accent-champagne/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Salvando..." : "Salvar e Concluir"}
          </button>
        </div>
      )}

      {previewImage && (
        <Portal>
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-h-[92vh] max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
            >
              <XCircle className="h-4 w-4" />
            </button>
            <img
              src={previewImage.url}
              alt={previewImage.label}
              className="max-h-[92vh] max-w-[92vw] rounded-2xl border border-border-subtle bg-surface-000 object-contain shadow-2xl"
            />
          </div>
        </div>
        </Portal>
      )}

      {editingCreative && (
        <EditCreativeModal
          creativeId={editingCreative.id}
          imageUrl={editingCreative.imageUrl}
          label={editingCreative.label}
          onClose={() => setEditingCreative(null)}
          onSaved={({ url }) => {
            // Cache-bust pra forcar o browser a recarregar a nova imagem
            const bustedUrl = url
              ? `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`
              : null;
            setCreatives((prev) =>
              prev.map((creative) =>
                creative.id === editingCreative.id
                  ? { ...creative, file_path: bustedUrl ?? creative.file_path, status: creative.status === "approved" ? "approved" : "completed", error_message: null }
                  : creative
              )
            );
          }}
        />
      )}
    </div>
  );
}

