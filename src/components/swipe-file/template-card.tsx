"use client";


import { cn } from "@/lib/utils";
import { Eye, EyeOff, Star } from "lucide-react";

interface TemplateCardProps {
  id: string;
  name: string;
  category: string;
  tags: string[];
  thumbnailUrl: string | null;
  isSystem: boolean;
  isActive: boolean;
  isFavorite?: boolean;
  rating?: number | null;
  copyElements: unknown[] | null;
  niche?: string | null;
  offerType?: string | null;
  advertiser?: string | null;
  sourceFormat?: string | null;
  onClick: () => void;
  onToggleFavorite?: (id: string, favorite: boolean) => void;
  onRate?: (id: string, rating: number) => void;
}

const nicheLabels: Record<string, string> = {
  high_ticket: "High Ticket",
  infoprodutos: "Infoprodutos",
  vendas: "Vendas",
  marketing: "Marketing",
  gestao: "Gestao",
  ia: "IA",
  trafego: "Trafego",
  educacao: "Educacao",
  financeiro: "Financeiro",
  saude: "Saude",
};

const offerLabels: Record<string, string> = {
  mentoria: "Mentoria",
  curso: "Curso",
  evento: "Evento",
  lead_magnet: "Lead Magnet",
  playbook: "Playbook",
  consultoria: "Consultoria",
  software: "Software",
};

const formatColors: Record<string, string> = {
  story: "bg-purple-500/20 text-purple-300",
  feed: "bg-green-500/20 text-green-300",
  carrossel: "bg-blue-500/20 text-blue-300",
};

export function TemplateCard({
  id,
  name,
  category,
  thumbnailUrl,
  isSystem,
  isActive,
  isFavorite,
  rating,
  niche,
  offerType,
  advertiser,
  sourceFormat,
  onClick,
  onToggleFavorite,
  onRate,
}: TemplateCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col border overflow-hidden text-left transition-all",
        isActive
          ? "border-[var(--border-subtle)] hover:border-[var(--border-default)] bg-[var(--surface-000)]"
          : "border-[var(--border-subtle)] bg-[var(--surface-050)] opacity-60"
      )}
    >
      {/* Thumbnail */}
      <button onClick={onClick} className="relative aspect-[4/5] bg-[var(--surface-100)] overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-[var(--text-muted)]">
            <span className="text-3xl">ðŸ“„</span>
          </div>
        )}

        {/* Top badges */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {isSystem && (
            <span className="px-2 py-0.5 text-[10px] font-medium bg-[var(--accent-alpha-20)] text-[var(--accent)] backdrop-blur-sm">
              Sistema
            </span>
          )}
          {sourceFormat && (
            <span className={cn("px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm", formatColors[sourceFormat] || "bg-gray-500/10 text-gray-400")}>
              {sourceFormat}
            </span>
          )}
          {!sourceFormat && (
            <span className="px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm bg-gray-500/10 text-gray-400">
              {category}
            </span>
          )}
        </div>

        {/* Offer type badge (bottom-left) */}
        {offerType && (
          <div className="absolute bottom-2 left-2">
            <span className="px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm bg-amber-500/20 text-amber-300">
              {offerLabels[offerType] || offerType}
            </span>
          </div>
        )}

        {/* Status overlay */}
        {!isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <EyeOff className="w-6 h-6 text-white/70" />
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>

      {/* Favorite button (top-right, always visible) */}
      {onToggleFavorite && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(id, !isFavorite);
          }}
          className={cn(
            "absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center transition-all backdrop-blur-sm",
            isFavorite
              ? "bg-[var(--accent)] text-black"
              : "bg-black/40 text-white/50 hover:text-white hover:bg-black/60"
          )}
          title={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        >
          <Star className={cn("w-4 h-4", isFavorite && "fill-current")} />
        </button>
      )}

      {/* Info */}
      <div className="p-3 space-y-1">
        <button onClick={onClick} className="text-left w-full">
          <h3 className="text-xs font-medium text-[var(--text-primary)] truncate">{name}</h3>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            {advertiser && (
              <span className="truncate">@{advertiser}</span>
            )}
            {advertiser && niche && <span>Â·</span>}
            {niche && (
              <span className="truncate">{nicheLabels[niche] || niche}</span>
            )}
          </div>
        </button>
        {/* Star Rating */}
        {onRate && (
          <div className="flex items-center gap-0.5 pt-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={(e) => {
                  e.stopPropagation();
                  onRate(id, star === rating ? 0 : star);
                }}
                className="p-0 text-[var(--text-muted)] hover:text-amber-400 transition-colors"
                title={`${star} estrela${star > 1 ? "s" : ""}`}
              >
                <Star
                  className={cn(
                    "w-3.5 h-3.5",
                    rating && star <= rating
                      ? "fill-amber-400 text-amber-400"
                      : "text-[var(--border-subtle)]"
                  )}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

