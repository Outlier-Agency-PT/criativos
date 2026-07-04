"use client";


import { useState } from "react";
import { X, Download, ThumbsUp, Trash2, Loader2, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export interface CreativeDetail {
  id: string;
  status: string;
  file_path: string | null;
  signed_url?: string | null;
  template_id: string | null;
  copy_id: string | null;
  prompt_used?: string | null;
  provider_used?: string | null;
  model_used?: string | null;
  generation_time_ms?: number | null;
  error_message?: string | null;
  created_at: string;
  project_name?: string;
}

interface CreativeDetailModalProps {
  creative: CreativeDetail;
  onClose: () => void;
  onStatusChange?: (id: string, status: "approved" | "discarded") => void;
}

export function CreativeDetailModal({ creative, onClose, onStatusChange }: CreativeDetailModalProps) {
  const [updating, setUpdating] = useState(false);

  async function handleStatusChange(newStatus: "approved" | "discarded") {
    setUpdating(true);
    try {
      const supabase = createBrowserSupabase();
      await supabase
        .from("criativos_creatives")
        .update({ status: newStatus })
        .eq("id", creative.id);
      onStatusChange?.(creative.id, newStatus);
    } finally {
      setUpdating(false);
    }
  }

  async function handleDownload() {
    if (!creative.signed_url) return;
    const a = document.createElement("a");
    a.href = creative.signed_url;
    a.download = `criativo-${creative.id.slice(0, 8)}.png`;
    a.target = "_blank";
    a.click();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-surface-000 rounded-2xl border border-border-subtle shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-border-subtle bg-surface-000/95 backdrop-blur-sm rounded-t-2xl">
          <h2 className="text-lg font-semibold text-text-primary">
            Criativo {creative.id.slice(0, 8)}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-6 p-6">
          {/* Imagem — grande, centralizada */}
          <div className="w-full flex justify-center bg-surface-050 p-4">
            {creative.signed_url ? (
              <img
                src={creative.signed_url}
                alt={`Criativo ${creative.id.slice(0, 8)}`}
                className="max-h-[60vh] w-auto object-contain"
              />
            ) : (
              <div className="w-full aspect-[4/5] max-w-md bg-surface-100 flex items-center justify-center">
                <ImageOff className="w-12 h-12 text-text-muted" />
              </div>
            )}
          </div>

          {/* Metadata — abaixo da imagem, em grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {creative.project_name && (
              <div>
                <h4 className="text-xs font-medium text-text-muted mb-1">Projeto</h4>
                <p className="text-sm text-text-secondary">{creative.project_name}</p>
              </div>
            )}

            <div>
              <h4 className="text-xs font-medium text-text-muted mb-1">Status</h4>
              <span className={cn(
                "inline-block px-2.5 py-1 text-xs font-medium",
                creative.status === "approved" ? "bg-green-500/20 text-green-400"
                  : creative.status === "completed" ? "bg-blue-500/20 text-blue-400"
                  : creative.status === "error" ? "bg-red-500/20 text-red-400"
                  : "bg-yellow-500/20 text-yellow-400"
              )}>
                {creative.status}
              </span>
            </div>

            <div>
              <h4 className="text-xs font-medium text-text-muted mb-1">Data</h4>
              <p className="text-sm text-text-secondary">
                {new Date(creative.created_at).toLocaleString("pt-BR")}
              </p>
            </div>

            {creative.model_used && (
              <div>
                <h4 className="text-xs font-medium text-text-muted mb-1">Modelo</h4>
                <p className="text-sm text-text-secondary font-mono">{creative.model_used}</p>
              </div>
            )}

            {creative.provider_used && (
              <div>
                <h4 className="text-xs font-medium text-text-muted mb-1">Provider</h4>
                <p className="text-sm text-text-secondary">{creative.provider_used}</p>
              </div>
            )}

            {creative.generation_time_ms != null && (
              <div>
                <h4 className="text-xs font-medium text-text-muted mb-1">Tempo</h4>
                <p className="text-sm text-text-secondary">{(creative.generation_time_ms / 1000).toFixed(1)}s</p>
              </div>
            )}
          </div>

          {/* Prompt (full width, below grid) */}
          {creative.prompt_used && (
            <div>
              <h4 className="text-xs font-medium text-text-muted mb-1">Prompt</h4>
              <p className="text-xs text-text-muted bg-surface-050 p-3 max-h-32 overflow-y-auto whitespace-pre-wrap">
                {creative.prompt_used}
              </p>
            </div>
          )}

          {creative.error_message && (
            <div>
              <h4 className="text-xs font-medium text-red-400 mb-1">Erro</h4>
              <p className="text-xs text-red-300 bg-red-500/10 p-3">{creative.error_message}</p>
            </div>
          )}

          {/* Acoes */}
          {creative.status !== "error" && creative.status !== "discarded" && (
            <div className="flex gap-2 pt-2 border-t border-border-subtle">
              <button
                onClick={handleDownload}
                disabled={!creative.signed_url}
                className="flex items-center gap-2 px-4 py-2 bg-surface-100 text-text-secondary text-sm hover:bg-surface-150 disabled:opacity-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              {creative.status !== "approved" && (
                <button
                  onClick={() => handleStatusChange("approved")}
                  disabled={updating}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-400 text-sm hover:bg-green-500/20 disabled:opacity-50 transition-colors"
                >
                  {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                  Aprovar
                </button>
              )}
              <button
                onClick={() => handleStatusChange("discarded")}
                disabled={updating}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 text-sm hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Descartar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

