"use client";


import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Building2,
  Calendar,
  Image,
  FolderOpen,
  RotateCcw,
  Save,
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

interface OrgData {
  id: string;
  name: string;
  setup_completed: boolean;
  setup_step: number;
  created_at: string;
}

interface TabAccountProps {
  orgId: string;
}

export function TabAccount({ orgId }: TabAccountProps) {
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Stats
  const [stats, setStats] = useState({ criativos: 0, projetos: 0 });

  const supabase = createBrowserSupabase();

  const fetchOrg = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .single();

      if (err) throw new Error(err.message);
      setOrg(data);
      setName(data.name || "");

      // Buscar stats
      const { count: criativosCount } = await supabase
        .from("criativos_creatives")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId);

      const { count: projetosCount } = await supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId);

      setStats({
        criativos: criativosCount || 0,
        projetos: projetosCount || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  async function handleSaveName() {
    if (!name.trim() || name === org?.name) return;
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from("organizations")
        .update({ name: name.trim() })
        .eq("id", orgId);

      if (err) throw new Error(err.message);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await fetchOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleRedoSetup() {
    try {
      const { error: err } = await supabase
        .from("organizations")
        .update({ setup_completed: false, setup_step: 0 })
        .eq("id", orgId);

      if (err) throw new Error(err.message);
      window.location.href = "/setup";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao reiniciar setup");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Nome da organizacao */}
      <div className="bg-surface-050 rounded-xl border border-border-subtle p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-text-muted" />
          <h3 className="text-sm font-semibold text-text-primary">Organizacao</h3>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Nome</label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setSaved(false); }}
              className="flex-1 px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
            />
            <button
              onClick={handleSaveName}
              disabled={saving || !name.trim() || name === org?.name}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saved ? "Salvo!" : "Salvar"}
            </button>
          </div>
        </div>
      </div>

      {/* Estatisticas */}
      <div className="bg-surface-050 rounded-xl border border-border-subtle p-5 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">Estatisticas</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-surface-100">
            <Image className="w-5 h-5 text-text-muted mx-auto mb-1" />
            <p className="text-lg font-bold text-text-primary">{stats.criativos}</p>
            <p className="text-[10px] text-text-muted">Criativos gerados</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-surface-100">
            <FolderOpen className="w-5 h-5 text-text-muted mx-auto mb-1" />
            <p className="text-lg font-bold text-text-primary">{stats.projetos}</p>
            <p className="text-[10px] text-text-muted">Projetos</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-surface-100">
            <Calendar className="w-5 h-5 text-text-muted mx-auto mb-1" />
            <p className="text-lg font-bold text-text-primary">
              {org?.created_at ? new Date(org.created_at).toLocaleDateString("pt-BR") : "-"}
            </p>
            <p className="text-[10px] text-text-muted">Data de criacao</p>
          </div>
        </div>
      </div>

      {/* Refazer setup */}
      <div className="bg-surface-050 rounded-xl border border-border-subtle p-5 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Setup Inicial</h3>
        <p className="text-xs text-text-muted">
          Refaca o setup para reconfigurar persona, fotos, brand kit e API keys do zero.
        </p>
        <button
          onClick={handleRedoSetup}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-200 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Refazer setup
        </button>
      </div>
    </div>
  );
}

