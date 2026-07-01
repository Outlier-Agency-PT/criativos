"use client";


import { useState } from "react";
import { Star, Trash2, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyCardProps {
  copy: {
    id: string;
    headline: string | null;
    mini_copy: string | null;
    list_items: string | null;
    cta: string | null;
    body: string | null;
    product: string | null;
    tags: string[];
    times_used: number;
    is_favorite: boolean;
    campaign_id: string | null;
    copy_campaigns?: { name: string } | null;
    source: string;
  };
  orgId: string;
  onClick: () => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onFavoriteToggle: (id: string, newState: boolean) => void;
}

export function CopyCard({ copy, orgId, onClick, onEdit, onDelete, onFavoriteToggle }: CopyCardProps) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleFavorite(e: React.MouseEvent) {
    e.stopPropagation();
    setToggling(true);
    try {
      const res = await fetch(`/api/copy-library/${copy.id}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (res.ok) {
        const data = await res.json();
        onFavoriteToggle(copy.id, data.is_favorite);
      }
    } catch {
      // silent
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Excluir esta copy permanentemente?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/copy-library/${copy.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (res.ok) onDelete(copy.id);
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  }

  function handleEdit(e: React.MouseEvent) {
    e.stopPropagation();
    onEdit();
  }

  const sourceLabel = copy.source === "ai_generated" ? "IA" : copy.source === "upload" ? "Arquivo" : copy.source === "local_import" ? "Local" : "Manual";

  return (
    <div
      onClick={onClick}
      className="group p-4 rounded-xl border border-border-subtle bg-surface-050 hover:border-border-default cursor-pointer transition-all space-y-2"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {copy.headline ? (
            <p className="text-sm font-medium text-text-primary line-clamp-2">{copy.headline}</p>
          ) : (
            <p className="text-sm text-text-muted italic">Sem headline</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleFavorite}
            disabled={toggling}
            className="p-1 rounded hover:bg-surface-200 transition-colors"
          >
            {toggling ? (
              <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
            ) : (
              <Star className={cn("w-4 h-4", copy.is_favorite ? "text-yellow-500 fill-yellow-500" : "text-text-muted")} />
            )}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1 rounded hover:bg-surface-200 text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Sub-headline */}
      {copy.mini_copy && (
        <p className="text-xs text-text-secondary line-clamp-2">{copy.mini_copy}</p>
      )}

      {/* List items */}
      {copy.list_items && (
        <p className="text-xs text-text-muted line-clamp-2">{copy.list_items.split("\n").filter(Boolean).join(" Â· ")}</p>
      )}

      {/* Meta */}
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {copy.product && (
            <span className="px-2 py-0.5 rounded text-[10px] bg-accent-champagne/10 text-accent-champagne font-medium border border-accent-champagne/20">
              {copy.product}
            </span>
          )}
          {copy.cta && (
            <span className="px-2 py-0.5 rounded text-[10px] bg-accent-champagne/20 text-accent-champagne font-medium">
              {copy.cta}
            </span>
          )}
          <span className="px-2 py-0.5 rounded text-[10px] bg-surface-200 text-text-muted">
            {sourceLabel}
          </span>
          {copy.times_used > 0 && (
            <span className="text-[10px] text-text-muted">Usado {copy.times_used}x</span>
          )}
          {copy.copy_campaigns?.name && (
            <span className="text-[10px] text-text-muted">{copy.copy_campaigns.name}</span>
          )}
          {copy.tags?.length > 0 && copy.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-surface-200 text-text-muted">
              #{tag}
            </span>
          ))}
        </div>

        <button
          onClick={handleEdit}
          className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] text-text-muted hover:bg-surface-200 hover:text-text-primary transition-colors"
        >
          <Pencil className="w-3 h-3" />
          Editar
        </button>
      </div>
    </div>
  );
}

