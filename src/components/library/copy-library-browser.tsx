"use client";


import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Search,
  Star,
  CheckSquare,
  Square,
  ChevronDown,
} from "lucide-react";

interface LibraryCopy {
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
}

interface Campaign {
  id: string;
  name: string;
}

interface CopyLibraryBrowserProps {
  orgId: string;
  onSelect: (copies: LibraryCopy[]) => void | Promise<void>;
  /** Quando true, mostra "Organizando com IA..." no botÃ£o e bloqueia novo clique. */
  busy?: boolean;
}

export function CopyLibraryBrowser({ orgId, onSelect, busy = false }: CopyLibraryBrowserProps) {
  const [copies, setCopies] = useState<LibraryCopy[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchDebounce, setSearchDebounce] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load campaigns
  useEffect(() => {
    fetch(`/api/copy-campaigns?orgId=${orgId}`)
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns || []))
      .catch(() => {});
  }, [orgId]);

  // Load copies
  useEffect(() => {
    loadCopies();
  }, [orgId, searchDebounce, campaignFilter, sortBy, page]);

  async function loadCopies() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ orgId, page: String(page), limit: "20", sort: sortBy });
      if (searchDebounce) params.set("search", searchDebounce);
      if (campaignFilter) params.set("campaignId", campaignFilter);

      const res = await fetch(`/api/copy-library?${params}`);
      const data = await res.json();
      if (res.ok) {
        setCopies(data.copies || []);
        setTotal(data.total || 0);
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }

  function toggleCopy(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  }

  const handleConfirm = useCallback(async () => {
    if (busy) return;
    const selectedCopies = copies.filter((c) => selected.has(c.id));
    if (selectedCopies.length === 0) return;

    // Track usage
    selectedCopies.forEach((c) => {
      fetch(`/api/copy-library/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          times_used: (c.times_used || 0) + 1,
          last_used_at: new Date().toISOString(),
        }),
      }).catch(() => {});
    });

    await onSelect(selectedCopies);
    setSelected(new Set());
  }, [copies, selected, onSelect, orgId, busy]);

  return (
    <div className="space-y-4">
      {/* Search + Filters */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar copies..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
          />
        </div>
        <select
          value={campaignFilter}
          onChange={(e) => { setCampaignFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
        >
          <option value="">Todas campanhas</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
        >
          <option value="created_at">Recentes</option>
          <option value="times_used">Mais usadas</option>
          <option value="last_used_at">Ãšltimo uso</option>
        </select>
      </div>

      {/* Copies list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      ) : copies.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-6">
          Nenhuma copy encontrada na biblioteca.
        </p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {copies.map((copy) => {
            const isSelected = selected.has(copy.id);
            return (
              <button
                key={copy.id}
                onClick={() => toggleCopy(copy.id)}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all flex gap-3",
                  isSelected
                    ? "border-accent-champagne bg-champagne-alpha-05"
                    : "border-border-subtle bg-surface-050 hover:border-border-default"
                )}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-accent-champagne" />
                  ) : (
                    <Square className="w-4 h-4 text-text-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  {copy.headline && (
                    <p className="text-sm font-medium text-text-primary line-clamp-1">{copy.headline}</p>
                  )}
                  {copy.mini_copy && (
                    <p className="text-xs text-text-secondary line-clamp-1">{copy.mini_copy}</p>
                  )}
                  {copy.list_items && (
                    <p className="text-[11px] text-text-muted line-clamp-1">
                      {copy.list_items.split("\n").filter(Boolean).slice(0, 3).map((item, i) => (
                        <span key={i}>{i > 0 ? " Â· " : ""}{item.trim()}</span>
                      ))}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {copy.cta && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-accent-champagne/20 text-accent-champagne font-medium">
                        {copy.cta}
                      </span>
                    )}
                    {copy.product && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-accent-champagne/10 text-accent-champagne font-medium border border-accent-champagne/20">
                        {copy.product}
                      </span>
                    )}
                    {copy.times_used > 0 && (
                      <span className="text-[10px] text-text-muted">
                        Usado {copy.times_used}x
                      </span>
                    )}
                    {copy.is_favorite && (
                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    )}
                    {copy.copy_campaigns?.name && (
                      <span className="text-[10px] text-text-muted">
                        {copy.copy_campaigns.name}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">{total} copies</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 text-xs rounded border border-border-subtle disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 20 >= total}
              className="px-3 py-1 text-xs rounded border border-border-subtle disabled:opacity-50"
            >
              PrÃ³xima
            </button>
          </div>
        </div>
      )}

      {/* Confirm button */}
      {selected.size > 0 && (
        <button
          onClick={handleConfirm}
          disabled={busy}
          className="w-full py-2.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy ? "Organizando com IA..." : `Adicionar selecionadas (${selected.size})`}
        </button>
      )}
    </div>
  );
}

