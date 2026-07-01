"use client";


import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Upload,
  Loader2,
  ArrowLeft,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { CopyCard } from "@/components/library/copy-card";
import { CopyEditModal } from "@/components/library/copy-edit-modal";
import { ImportFileModal } from "@/components/library/import-file-modal";
import { LocalDirectoryImport } from "@/components/library/local-directory-import";
import { CopyPreviewModal } from "@/components/library/copy-preview-modal";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

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
  source: string;
  copy_campaigns?: { name: string } | null;
}

interface Campaign {
  id: string;
  name: string;
  copy_count: number;
}

export default function BibliotecaPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [copies, setCopies] = useState<LibraryCopy[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchDebounce, setSearchDebounce] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [productFilter, setProductFilter] = useState("");
  const [products, setProducts] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("created_at");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Campaign management
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [editCampaignName, setEditCampaignName] = useState("");
  const [campaignMenuId, setCampaignMenuId] = useState<string | null>(null);

  // Modals
  const [editModal, setEditModal] = useState<{ copy: LibraryCopy | null } | null>(null);
  const [previewCopy, setPreviewCopy] = useState<LibraryCopy | null>(null);
  const [importModal, setImportModal] = useState(false);

  // Localhost detection (for local directory import)
  const [isLocalhost, setIsLocalhost] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      setIsLocalhost(host === "localhost" || host === "127.0.0.1");
    }
  }, []);

  const supabase = createBrowserSupabase();

  // Get orgId
  useEffect(() => {
    async function getOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (data) setOrgId(data.org_id);
    }
    getOrg();
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load campaigns
  const loadCampaigns = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/copy-campaigns?orgId=${orgId}`);
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch {
      // silent
    }
  }, [orgId]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  // Load distinct products for filter dropdown
  const loadProducts = useCallback(async () => {
    if (!orgId || !selectedCampaign) return;
    try {
      const params = new URLSearchParams({
        orgId,
        page: "1",
        limit: "100",
        sort: "created_at",
        campaignId: selectedCampaign.id,
      });
      const res = await fetch(`/api/copy-library?${params}`);
      const data = await res.json();
      if (res.ok) {
        const uniqueProducts = Array.from(
          new Set(
            (data.copies || [])
              .map((c: LibraryCopy) => c.product)
              .filter(Boolean)
          )
        ) as string[];
        setProducts(uniqueProducts);
      }
    } catch {
      // silent
    }
  }, [orgId, selectedCampaign]);

  // Load copies (only when inside a campaign)
  const loadCopies = useCallback(async () => {
    if (!orgId || !selectedCampaign) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        orgId,
        page: String(page),
        limit: "24",
        sort: sortBy,
        campaignId: selectedCampaign.id,
      });
      if (searchDebounce) params.set("search", searchDebounce);
      if (productFilter) params.set("product", productFilter);

      const res = await fetch(`/api/copy-library?${params}`);
      const data = await res.json();
      if (res.ok) {
        setCopies(data.copies || []);
        setTotal(data.total || 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [orgId, selectedCampaign, searchDebounce, sortBy, page, productFilter]);

  useEffect(() => {
    if (selectedCampaign) {
      loadCopies();
      loadProducts();
    }
  }, [loadCopies, selectedCampaign, loadProducts]);

  // Also load "all copies" when viewing all (no campaign filter)
  const loadAllCopies = useCallback(async () => {
    if (!orgId || selectedCampaign) return;
    // We don't load copies in campaign-grid view, only when "Todas" is selected
  }, [orgId, selectedCampaign]);

  function handleFavoriteToggle(id: string, newState: boolean) {
    setCopies((prev) => prev.map((c) => c.id === id ? { ...c, is_favorite: newState } : c));
  }

  function handleDelete(id: string) {
    setCopies((prev) => prev.filter((c) => c.id !== id));
    setTotal((t) => t - 1);
  }

  function openCampaign(campaign: Campaign) {
    setSelectedCampaign(campaign);
    setSearch("");
    setSearchDebounce("");
    setPage(1);
    setLoading(true);
  }

  function goBack() {
    setSelectedCampaign(null);
    setCopies([]);
    setSearch("");
    setSearchDebounce("");
    setProductFilter("");
    setProducts([]);
    setPage(1);
  }

  // Campaign CRUD
  async function handleCreateCampaign() {
    if (!newCampaignName.trim() || !orgId) return;
    setSavingCampaign(true);
    try {
      const res = await fetch("/api/copy-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, name: newCampaignName.trim() }),
      });
      if (res.ok) {
        setNewCampaignName("");
        setCreatingCampaign(false);
        loadCampaigns();
      }
    } finally {
      setSavingCampaign(false);
    }
  }

  async function handleEditCampaign(id: string) {
    if (!editCampaignName.trim() || !orgId) return;
    setSavingCampaign(true);
    try {
      const res = await fetch(`/api/copy-campaigns/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, name: editCampaignName.trim() }),
      });
      if (res.ok) {
        setEditingCampaignId(null);
        loadCampaigns();
      }
    } finally {
      setSavingCampaign(false);
    }
  }

  async function handleDeleteCampaign(id: string) {
    if (!orgId) return;
    if (!confirm("Excluir esta campanha? As copies dentro nao serao apagadas.")) return;
    try {
      const res = await fetch(`/api/copy-campaigns/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (res.ok) {
        loadCampaigns();
        setCampaignMenuId(null);
      }
    } catch {
      // silent
    }
  }

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  const totalPages = Math.ceil(total / 24);
  const totalCopies = campaigns.reduce((sum, c) => sum + c.copy_count, 0);

  // â”€â”€â”€ Campaign Grid View â”€â”€â”€
  if (!selectedCampaign) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Biblioteca</h1>
            <p className="text-sm text-text-muted mt-1">
              {campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""} Â· {totalCopies} copies
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border-subtle text-sm text-text-secondary hover:bg-surface-100 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Importar
            </button>
            <button
              onClick={() => setCreatingCampaign(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nova Campanha
            </button>
          </div>
        </div>

        {/* Create campaign inline */}
        {creatingCampaign && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-accent-champagne/30 bg-accent-champagne/5">
            <input
              type="text"
              value={newCampaignName}
              onChange={(e) => setNewCampaignName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateCampaign(); if (e.key === "Escape") setCreatingCampaign(false); }}
              placeholder="Nome da campanha"
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-000 text-text-primary focus:outline-none focus:border-accent-champagne"
              autoFocus
            />
            <button
              onClick={handleCreateCampaign}
              disabled={savingCampaign || !newCampaignName.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-champagne text-surface-900 disabled:opacity-50"
            >
              {savingCampaign ? "Criando..." : "Criar"}
            </button>
            <button
              onClick={() => { setCreatingCampaign(false); setNewCampaignName(""); }}
              className="p-2 rounded-lg text-text-muted hover:text-text-primary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Campaign boxes grid */}
        {campaigns.length === 0 && !creatingCampaign ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8 text-text-muted" />
            </div>
            <h2 className="text-lg font-medium text-text-primary mb-1">Nenhuma campanha ainda</h2>
            <p className="text-sm text-text-muted mb-4">Crie a primeira campanha para organizar suas copies.</p>
            <button
              onClick={() => setCreatingCampaign(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Nova Campanha
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {campaigns.map((c) => (
              <div key={c.id} className="relative group">
                {editingCampaignId === c.id ? (
                  <div className="p-4 rounded-xl border border-accent-champagne bg-surface-050 space-y-3">
                    <input
                      type="text"
                      value={editCampaignName}
                      onChange={(e) => setEditCampaignName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleEditCampaign(c.id); if (e.key === "Escape") setEditingCampaignId(null); }}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-000 text-text-primary focus:outline-none focus:border-accent-champagne"
                      autoFocus
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleEditCampaign(c.id)}
                        disabled={savingCampaign}
                        className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-accent-champagne text-surface-900 disabled:opacity-50"
                      >
                        <Check className="w-3 h-3 mx-auto" />
                      </button>
                      <button
                        onClick={() => setEditingCampaignId(null)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-border-subtle text-text-muted"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openCampaign(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openCampaign(c);
                      }
                    }}
                    className="w-full text-left p-5 rounded-xl border border-border-subtle bg-surface-050 hover:border-border-default hover:bg-surface-000 transition-all group cursor-pointer focus:outline-none focus:border-accent-champagne"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <FolderOpen className="w-6 h-6 text-accent-champagne" />
                      {/* Menu button */}
                      <div
                        className="relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => setCampaignMenuId(campaignMenuId === c.id ? null : c.id)}
                          className="p-1 rounded-lg text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-primary hover:bg-surface-200 transition-all"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {campaignMenuId === c.id && (
                          <div className="absolute right-0 top-8 z-10 w-36 py-1 rounded-lg bg-surface-000 border border-border-subtle shadow-xl">
                            <button
                              onClick={() => { setEditingCampaignId(c.id); setEditCampaignName(c.name); setCampaignMenuId(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-surface-100"
                            >
                              <Pencil className="w-3 h-3" /> Renomear
                            </button>
                            <button
                              onClick={() => handleDeleteCampaign(c.id)}
                              disabled={c.copy_count > 0}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-accent-red hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={c.copy_count > 0 ? "Remova as copies primeiro" : ""}
                            >
                              <Trash2 className="w-3 h-3" /> Excluir
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <h3 className="text-sm font-medium text-text-primary truncate">{c.name}</h3>
                    <p className="text-xs text-text-muted mt-1">
                      {c.copy_count} cop{c.copy_count !== 1 ? "ies" : "y"}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Local directory import â€” localhost only */}
        {isLocalhost && (
          <LocalDirectoryImport
            orgId={orgId}
            campaigns={campaigns}
            onImportComplete={() => loadCampaigns()}
          />
        )}

        {/* Import modal */}
        {importModal && (
          <ImportFileModal
            orgId={orgId}
            campaigns={campaigns}
            onClose={() => setImportModal(false)}
            onImported={() => { setImportModal(false); loadCampaigns(); }}
          />
        )}
      </div>
    );
  }

  // â”€â”€â”€ Copies View (inside a campaign) â”€â”€â”€
  return (
    <div className="space-y-6">
      {/* Header with back */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="p-2 -ml-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{selectedCampaign.name}</h1>
            <p className="text-sm text-text-muted mt-0.5">
              {total} cop{total !== 1 ? "ies" : "y"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-subtle text-sm text-text-secondary hover:bg-surface-100 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Importar</span>
          </button>
          <button
            onClick={() => setEditModal({ copy: null })}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Copy
          </button>
        </div>
      </div>

      {/* Search + filters + sort */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar copies..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-champagne"
          />
        </div>
        {products.length > 0 && (
          <select
            value={productFilter}
            onChange={(e) => { setProductFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
          >
            <option value="">Todos produtos</option>
            {products.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
        >
          <option value="created_at">Recentes</option>
          <option value="times_used">Mais usadas</option>
          <option value="last_used_at">Ultimo uso</option>
        </select>
      </div>

      {/* Copy grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      ) : copies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-sm text-text-muted">Nenhuma copy nesta campanha.</p>
          <button
            onClick={() => setEditModal({ copy: null })}
            className="text-sm text-accent-champagne hover:underline"
          >
            Criar primeira copy
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {copies.map((copy) => (
            <CopyCard
              key={copy.id}
              copy={copy}
              orgId={orgId}
              onClick={() => setPreviewCopy(copy)}
              onEdit={() => setEditModal({ copy })}
              onDelete={handleDelete}
              onFavoriteToggle={handleFavoriteToggle}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">{total} copies</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-xs rounded-lg border border-border-subtle disabled:opacity-50 text-text-secondary"
            >
              Anterior
            </button>
            <span className="text-xs text-text-muted">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-xs rounded-lg border border-border-subtle disabled:opacity-50 text-text-secondary"
            >
              Proxima
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {previewCopy && (
        <CopyPreviewModal
          copy={previewCopy}
          onClose={() => setPreviewCopy(null)}
          onEdit={() => { setEditModal({ copy: previewCopy }); setPreviewCopy(null); }}
        />
      )}

      {editModal && (
        <CopyEditModal
          copy={editModal.copy}
          campaigns={campaigns}
          orgId={orgId}
          initialCampaignId={selectedCampaign?.id}
          onClose={() => setEditModal(null)}
          onSaved={() => { loadCopies(); loadCampaigns(); }}
        />
      )}

      {importModal && (
        <ImportFileModal
          orgId={orgId}
          campaigns={campaigns}
          onClose={() => setImportModal(false)}
          onImported={() => { setImportModal(false); loadCopies(); loadCampaigns(); }}
        />
      )}
    </div>
  );
}

