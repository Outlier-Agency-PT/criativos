"use client";


import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight, ImageOff, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CreativeItem {
  id: string;
  status: string;
  file_path: string | null;
  signed_url: string | null;
  created_at: string;
}

export interface ProjectGroupData {
  project_id: string;
  project_name: string;
  project_status: string;
  creatives: CreativeItem[];
}

interface ProjectGroupProps {
  group: ProjectGroupData;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-gray-500/10 text-gray-400" },
  generating: { label: "Gerando", className: "bg-yellow-500/10 text-yellow-400" },
  completed: { label: "Concluido", className: "bg-green-500/10 text-green-400" },
  complete: { label: "Concluido", className: "bg-green-500/10 text-green-400" },
  partial: { label: "Parcial", className: "bg-amber-500/10 text-amber-400" },
  error: { label: "Erro", className: "bg-red-500/10 text-red-400" },
};

export function ProjectGroup({ group }: ProjectGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const statusInfo = statusLabels[group.project_status] ?? statusLabels.draft;
  const completedCreatives = group.creatives.filter((c) => c.status === "completed" && c.signed_url);
  const completedCount = completedCreatives.length;

  return (
    <div className="theme-panel rounded-[22px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 p-4">
        {/* Thumbnails + nome â€” clique vai pro projeto */}
        <div
          onClick={() => router.push(`/criar?regenerate=${group.project_id}`)}
          className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
        >
          {/* Thumbnails preview â€” 4 primeiros criativos */}
          <div className="flex-shrink-0 w-24 h-24 rounded-2xl overflow-hidden bg-surface-100 grid grid-cols-2 grid-rows-2 gap-px border border-white/5">
            {[0, 1, 2, 3].map((i) => {
              const c = completedCreatives[i];
              return (
                <div key={i} className="bg-surface-150 overflow-hidden">
                  {c?.signed_url ? (
                    <img src={c.signed_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageOff className="w-3 h-3 text-text-muted/20" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-text-primary truncate hover:text-accent-champagne transition-colors">
                {group.project_name}
              </h3>
              <span className={cn("px-2 py-0.5 text-[10px] font-medium rounded-full flex-shrink-0", statusInfo.className)}>
                {statusInfo.label}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1">
              {completedCount} criativo{completedCount !== 1 ? "s" : ""} gerado{completedCount !== 1 ? "s" : ""}
            </p>
            <p className="text-[10px] text-accent-champagne/60 mt-0.5 flex items-center gap-1">
              <Pencil className="w-2.5 h-2.5" />
              Clique para abrir o resultado do projeto
            </p>
          </div>
        </div>

        {/* Setinha â€” expande/colapsa galeria */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-shrink-0 p-2.5 rounded-xl hover:bg-champagne-alpha-10 transition-colors"
          title={expanded ? "Fechar galeria" : "Ver criativos"}
        >
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-text-muted" />
          ) : (
            <ChevronRight className="w-5 h-5 text-text-muted" />
          )}
        </button>
      </div>

      {/* Expanded content â€” list of creatives */}
      {expanded && (
        <div className="border-t border-border-subtle px-4 py-3">
          {group.creatives.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">Nenhum criativo neste projeto</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {group.creatives.map((creative) => (
                <Link
                  key={creative.id}
                  href={`/galeria/${group.project_id}`}
                  className="group relative flex flex-col rounded-2xl border border-border-subtle overflow-hidden hover:border-accent-champagne transition-all bg-surface-000/70"
                >
                  <div className="relative aspect-[4/5] bg-surface-100 overflow-hidden">
                    {creative.signed_url ? (
                      <img
                        src={creative.signed_url}
                        alt={`Criativo ${creative.id.slice(0, 8)}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full text-text-muted">
                        <ImageOff className="w-6 h-6" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] text-text-muted truncate">
                      {new Date(creative.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

