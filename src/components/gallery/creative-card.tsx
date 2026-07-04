"use client";


import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Clock, ImageOff } from "lucide-react";

export interface CreativeCardData {
  id: string;
  status: "pending" | "generating" | "completed" | "error" | "approved" | "discarded";
  file_path: string | null;
  signed_url?: string | null;
  template_id: string | null;
  copy_id: string | null;
  created_at: string;
  project_name?: string;
}

interface CreativeCardProps {
  creative: CreativeCardData;
  onClick: () => void;
}

const statusConfig: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  approved: { label: "Aprovado", className: "bg-green-500/20 text-green-400", icon: CheckCircle2 },
  completed: { label: "Concluído", className: "bg-blue-500/20 text-blue-400", icon: CheckCircle2 },
  pending: { label: "Pendente", className: "bg-yellow-500/20 text-yellow-400", icon: Clock },
  generating: { label: "Gerando", className: "bg-yellow-500/20 text-yellow-400", icon: Clock },
  error: { label: "Erro", className: "bg-red-500/20 text-red-400", icon: AlertCircle },
  discarded: { label: "Descartado", className: "bg-red-500/20 text-red-400/60", icon: AlertCircle },
};

export function CreativeCard({ creative, onClick }: CreativeCardProps) {
  const config = statusConfig[creative.status] ?? statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex flex-col rounded-xl border overflow-hidden text-left transition-all",
        creative.status === "discarded"
          ? "border-border-subtle/50 opacity-50"
          : "border-border-subtle hover:border-accent-champagne bg-surface-000"
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/5] bg-surface-100 overflow-hidden">
        {creative.signed_url ? (
          <img
            src={creative.signed_url}
            alt={`Criativo ${creative.id.slice(0, 8)}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-text-muted">
            <ImageOff className="w-8 h-8" />
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-2 left-2">
          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-sm", config.className)}>
            <StatusIcon className="w-3 h-3" />
            {config.label}
          </span>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
      </div>

      {/* Info */}
      <div className="p-3 space-y-1">
        {creative.project_name && (
          <p className="text-xs text-text-muted truncate">{creative.project_name}</p>
        )}
        <p className="text-xs text-text-muted">
          {new Date(creative.created_at).toLocaleDateString("pt-BR")}
        </p>
      </div>
    </button>
  );
}

