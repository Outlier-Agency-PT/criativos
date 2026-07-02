"use client";


import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Star,
  StarOff,
  Palette,
  Globe,
  Lock,
  Pencil,
  Check,
} from "lucide-react";

interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

interface BrandKit {
  id: string;
  name: string;
  org_id: string;
  colors: BrandColors;
  fonts: { heading: { family: string }; body: { family: string } };
  source_url: string | null;
  is_default: boolean;
  is_system: boolean;
  created_at: string;
}

interface TabBrandKitsProps {
  orgId: string;
}

function getFontFamily(font: unknown): string {
  if (typeof font === "string") return font;
  if (font && typeof font === "object") {
    const f = (font as Record<string, unknown>).family;
    if (typeof f === "string") return f;
    if (f && typeof f === "object") return String((f as Record<string, unknown>).family || "Inter");
  }
  return "Inter";
}

export function TabBrandKits({ orgId }: TabBrandKitsProps) {
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  // Edição de brand kit existente (null = não está editando)
  const [editingId, setEditingId] = useState<string | null>(null);

  // Create form state
  const [mode, setMode] = useState<"extract" | "manual" | null>(null);
  const [url, setUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("Meu Brand Kit");
  const [colors, setColors] = useState<BrandColors>({
    primary: "#1a237e",
    secondary: "#424242",
    accent: "#ff5722",
    background: "#ffffff",
    text: "#212121",
  });
  const [headingFont, setHeadingFont] = useState("Inter");
  const [bodyFont, setBodyFont] = useState("Inter");
  const [extracted, setExtracted] = useState(false);

  const fetchBrandKits = useCallback(async () => {
    try {
      const res = await fetch(`/api/brand-kits?orgId=${orgId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBrandKits(data.brandKits || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar brand kits");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchBrandKits();
  }, [fetchBrandKits]);

  function resetForm() {
    setMode(null);
    setUrl("");
    setExtracted(false);
    setName("Meu Brand Kit");
    setColors({ primary: "#1a237e", secondary: "#424242", accent: "#ff5722", background: "#ffffff", text: "#212121" });
    setHeadingFont("Inter");
    setBodyFont("Inter");
    setEditingId(null);
  }

  // Abre o formulário já preenchido com os dados de um brand kit existente.
  function startEdit(bk: BrandKit) {
    setEditingId(bk.id);
    setShowCreate(true);
    setMode("manual"); // pula a escolha extrair/manual, vai direto pro form de campos
    setExtracted(true);
    setName(bk.name);
    setColors({
      primary: bk.colors?.primary ?? "#1a237e",
      secondary: bk.colors?.secondary ?? "#424242",
      accent: bk.colors?.accent ?? "#ff5722",
      background: bk.colors?.background ?? "#ffffff",
      text: bk.colors?.text ?? "#212121",
    });
    setHeadingFont(getFontFamily(bk.fonts?.heading));
    setBodyFont(getFontFamily(bk.fonts?.body));
    setError(null);
  }

  async function handleExtract() {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch("/api/brand-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setColors(data.colors);
      setHeadingFont(getFontFamily(data.fonts?.heading));
      setBodyFont(getFontFamily(data.fonts?.body));
      setExtracted(true);
      setName(`Brand de ${new URL(url).hostname}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao extrair");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const fonts = {
        heading: { family: headingFont, weight: "700" },
        body: { family: bodyFont, weight: "400" },
      };

      let res: Response;
      if (editingId) {
        // Edição de brand kit existente — PATCH (não cria novo, não apaga nada)
        res = await fetch("/api/brand-kits", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, orgId, name, colors, fonts }),
        });
      } else {
        // Criação
        res = await fetch("/api/brand-kits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            org_id: orgId,
            name,
            source_url: url || null,
            colors,
            fonts,
            is_default: brandKits.length === 0,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowCreate(false);
      resetForm();
      await fetchBrandKits();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/brand-kits?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setDeleteConfirm(null);
      await fetchBrandKits();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao eliminar");
    }
  }

  async function handleSetDefault(id: string) {
    try {
      for (const bk of brandKits.filter((b) => b.is_default)) {
        await fetch("/api/brand-kits", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: bk.id, is_default: false }),
        });
      }
      await fetch("/api/brand-kits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_default: true }),
      });
      await fetchBrandKits();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao definir padrao");
    }
  }

  const colorFields: { key: keyof BrandColors; label: string }[] = [
    { key: "primary", label: "Primária" },
    { key: "secondary", label: "Secundária" },
    { key: "accent", label: "Acento" },
    { key: "background", label: "Fundo" },
    { key: "text", label: "Texto" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-text-muted" />
          <span className="text-sm text-text-secondary">{brandKits.length} brand kit{brandKits.length !== 1 ? "s" : ""}</span>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); if (showCreate) resetForm(); }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90"
        >
          <Plus className="w-4 h-4" />
          Novo Brand Kit
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Formulario de criacao */}
      {showCreate && (
        <div className="bg-surface-050 rounded-xl border border-border-subtle p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">{editingId ? "Editar Brand Kit" : "Criar novo Brand Kit"}</h3>

          {!mode && (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setMode("extract")} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border-subtle hover:border-accent-champagne bg-surface-100 transition-colors">
                <Globe className="w-6 h-6 text-accent-champagne" />
                <span className="text-xs font-medium text-text-primary">Extrair do site</span>
              </button>
              <button onClick={() => setMode("manual")} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border-subtle hover:border-accent-champagne bg-surface-100 transition-colors">
                <Palette className="w-6 h-6 text-accent-champagne" />
                <span className="text-xs font-medium text-text-primary">Configurar manual</span>
              </button>
            </div>
          )}

          {mode === "extract" && !extracted && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://meusite.com.br"
                  className="flex-1 px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
                />
                <button onClick={handleExtract} disabled={!url || extracting} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium disabled:opacity-50">
                  {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                  Extrair
                </button>
              </div>
            </div>
          )}

          {(mode === "manual" || extracted) && (
            <>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Nome</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-2">Cores</label>
                <div className="grid grid-cols-5 gap-3">
                  {colorFields.map((cf) => (
                    <div key={cf.key} className="text-center">
                      <input type="color" value={colors[cf.key]} onChange={(e) => setColors({ ...colors, [cf.key]: e.target.value })} className="w-full h-10 rounded-lg cursor-pointer border border-border-subtle" />
                      <span className="text-[10px] text-text-muted mt-1 block">{cf.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Fonte títulos</label>
                  <input value={headingFont} onChange={(e) => setHeadingFont(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Fonte corpo</label>
                  <input value={bodyFont} onChange={(e) => setBodyFont(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar Brand Kit"}
                </button>
                <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-4 py-2 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-200">
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Lista de brand kits */}
      {brandKits.length === 0 && !showCreate ? (
        <div className="text-center py-12 text-text-muted text-sm">
          Nenhum brand kit cadastrado. Clique em &quot;Novo Brand Kit&quot; para começar.
        </div>
      ) : (
        <div className="space-y-3">
          {brandKits.map((bk) => (
            <div key={bk.id} className="bg-surface-050 rounded-xl border border-border-subtle p-4 flex items-start gap-4">
              {/* Preview cores */}
              <div className="flex gap-1 mt-1">
                {bk.colors && Object.values(bk.colors).map((c, i) => (
                  <div key={i} className="w-5 h-5 rounded-full border border-border-subtle" style={{ backgroundColor: c as string }} />
                ))}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-text-primary truncate">{bk.name}</h3>
                  {bk.is_default && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-champagne/10 text-accent-champagne text-[10px] font-medium">
                      <Star className="w-3 h-3" /> Padrao
                    </span>
                  )}
                  {bk.is_system && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-100 text-text-muted text-[10px] font-medium">
                      <Lock className="w-3 h-3" /> Sistema
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted">
                  {getFontFamily(bk.fonts?.heading)} / {getFontFamily(bk.fonts?.body)}
                </p>
              </div>

              <div className="flex items-center gap-1">
                {!bk.is_system && (
                  <button
                    onClick={() => startEdit(bk)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-accent-champagne hover:bg-surface-100 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {!bk.is_system && !bk.is_default && (
                  <button
                    onClick={() => handleSetDefault(bk.id)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-accent-champagne hover:bg-surface-100 transition-colors"
                    title="Marcar como padrao"
                  >
                    <StarOff className="w-4 h-4" />
                  </button>
                )}
                {!bk.is_system && (
                  deleteConfirm === bk.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(bk.id)}
                        className="px-2 py-1 rounded text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-2 py-1 rounded text-xs text-text-muted hover:bg-surface-100"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(bk.id)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
