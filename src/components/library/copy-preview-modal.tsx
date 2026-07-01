"use client";


import { X, Pencil, List } from "lucide-react";

interface CopyData {
  id: string;
  headline: string | null;
  mini_copy: string | null;
  list_items: string | null;
  cta: string | null;
  body: string | null;
  product: string | null;
  tags: string[];
  campaign_id: string | null;
  source: string;
  copy_campaigns?: { name: string } | null;
}

interface CopyPreviewModalProps {
  copy: CopyData;
  onClose: () => void;
  onEdit: () => void;
}

export function CopyPreviewModal({ copy, onClose, onEdit }: CopyPreviewModalProps) {
  const listItems = copy.list_items
    ? copy.list_items.split("\n").filter((l) => l.trim().length > 0)
    : [];

  const sourceLabel =
    copy.source === "ai_generated"
      ? "IA"
      : copy.source === "upload"
        ? "Arquivo"
        : copy.source === "local-import"
          ? "Local"
          : "Manual";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-100 rounded-2xl border border-border-subtle w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text-primary">Visualizar Copy</h2>
            {copy.product && (
              <span className="px-2 py-0.5 rounded text-[10px] bg-accent-champagne/10 text-accent-champagne font-medium border border-accent-champagne/20">
                {copy.product}
              </span>
            )}
            <span className="px-2 py-0.5 rounded text-[10px] bg-surface-200 text-text-muted">
              {sourceLabel}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface-200 rounded-lg">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {/* Preview structured */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-4">
            {/* Headline */}
            {copy.headline && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Headline</span>
                <p className="mt-1 text-lg font-semibold text-text-primary leading-snug">
                  {copy.headline}
                </p>
              </div>
            )}

            {/* Mini copy */}
            {copy.mini_copy && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Mini Copy</span>
                <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                  {copy.mini_copy}
                </p>
              </div>
            )}

            {/* List items */}
            {listItems.length > 0 && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Lista</span>
                <ul className="mt-1.5 space-y-1.5">
                  {listItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-champagne flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* CTA */}
            {copy.cta && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">CTA</span>
                <div className="mt-1.5">
                  <span className="inline-block px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium">
                    {copy.cta}
                  </span>
                </div>
              </div>
            )}

            {/* Body (if has extra content) */}
            {copy.body && (
              <div className="pt-2 border-t border-border-subtle">
                <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Body</span>
                <p className="mt-1 text-xs text-text-muted leading-relaxed whitespace-pre-wrap">
                  {copy.body}
                </p>
              </div>
            )}

            {/* Tags */}
            {copy.tags?.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-2">
                {copy.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded text-[10px] bg-surface-200 text-text-muted">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-200"
          >
            Fechar
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent-champagne text-surface-900"
          >
            <Pencil className="w-3.5 h-3.5" />
            Editar
          </button>
        </div>
      </div>
    </div>
  );
}

