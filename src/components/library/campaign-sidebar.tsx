"use client";


import { useState } from "react";
import { cn } from "@/lib/utils";
import { Plus, Loader2, FolderOpen, Trash2, Pencil, X, Check } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  copy_count: number;
}

interface CampaignSidebarProps {
  campaigns: Campaign[];
  selected: string;
  onSelect: (id: string) => void;
  orgId: string;
  onCampaignsChange: () => void;
}

export function CampaignSidebar({ campaigns, selected, onSelect, orgId, onCampaignsChange }: CampaignSidebarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/copy-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, name: newName.trim() }),
      });
      if (res.ok) {
        setNewName("");
        setCreating(false);
        onCampaignsChange();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/copy-campaigns/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, name: editName.trim() }),
      });
      if (res.ok) {
        setEditingId(null);
        onCampaignsChange();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/copy-campaigns/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (res.ok) {
        if (selected === id) onSelect("");
        onCampaignsChange();
      }
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="w-56 flex-shrink-0 border-r border-border-subtle bg-surface-050 flex flex-col h-full">
      <div className="p-3 border-b border-border-subtle flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Campanhas</h3>
        <button
          onClick={() => setCreating(true)}
          className="p-1 rounded hover:bg-surface-200 text-text-muted hover:text-text-primary"
          title="Nova campanha"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {/* All copies */}
        <button
          onClick={() => onSelect("")}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors",
            selected === ""
              ? "bg-champagne-alpha-10 text-text-accent"
              : "text-text-secondary hover:bg-surface-100"
          )}
        >
          <FolderOpen className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">Todas</span>
        </button>

        {/* Campaigns */}
        {campaigns.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group flex items-center gap-1 px-3 py-2 text-sm transition-colors",
              selected === c.id
                ? "bg-champagne-alpha-10 text-text-accent"
                : "text-text-secondary hover:bg-surface-100"
            )}
          >
            {editingId === c.id ? (
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleEdit(c.id); if (e.key === "Escape") setEditingId(null); }}
                  className="flex-1 px-1.5 py-0.5 text-xs rounded border border-border-subtle bg-surface-050 text-text-primary"
                  autoFocus
                />
                <button onClick={() => handleEdit(c.id)} disabled={saving} className="p-0.5 text-accent-champagne">
                  <Check className="w-3 h-3" />
                </button>
                <button onClick={() => setEditingId(null)} className="p-0.5 text-text-muted">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <>
                <button onClick={() => onSelect(c.id)} className="flex-1 text-left truncate">
                  {c.name}
                </button>
                <span className="text-[10px] text-text-muted">{c.copy_count}</span>
                <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                  <button
                    onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                    className="p-0.5 text-text-muted hover:text-text-primary"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deleting === c.id || c.copy_count > 0}
                    className="p-0.5 text-text-muted hover:text-accent-red disabled:opacity-30"
                    title={c.copy_count > 0 ? "Remova as copies primeiro" : "eliminar campanha"}
                  >
                    {deleting === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Create form */}
      {creating && (
        <div className="p-3 border-t border-border-subtle space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            placeholder="Nome da campanha"
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
            autoFocus
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleCreate}
              disabled={saving || !newName.trim()}
              className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-accent-champagne text-surface-900 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Criar"}
            </button>
            <button
              onClick={() => { setCreating(false); setNewName(""); }}
              className="px-3 py-1.5 text-xs rounded-lg border border-border-subtle text-text-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

