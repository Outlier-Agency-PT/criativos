"use client";


import { useState } from "react";
import { Loader2, Globe, Palette } from "lucide-react";

interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

interface StepBrandKitProps {
  orgId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export function StepBrandKit({ orgId, onComplete, onSkip }: StepBrandKitProps) {
  const [mode, setMode] = useState<"extract" | "manual" | null>(null);
  const [url, setUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (data.fonts?.heading?.family) setHeadingFont(data.fonts.heading.family);
      if (data.fonts?.body?.family) setBodyFont(data.fonts.body.family);
      setExtracted(true);
      setName(`Brand de ${new URL(url).hostname}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao extrair. Tente configurar manualmente.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/brand-kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          name,
          source_url: url || null,
          colors,
          fonts: {
            heading: { family: headingFont, weight: "700" },
            body: { family: bodyFont, weight: "400" },
          },
          is_default: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const colorFields: { key: keyof BrandColors; label: string }[] = [
    { key: "primary", label: "Primária" },
    { key: "secondary", label: "Secundária" },
    { key: "accent", label: "Acento" },
    { key: "background", label: "Fundo" },
    { key: "text", label: "Texto" },
  ];

  if (!mode) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-text-muted">Como deseja configurar seu branding?</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setMode("extract")} className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border-subtle hover:border-accent-champagne bg-surface-050 transition-colors">
            <Globe className="w-8 h-8 text-accent-champagne" />
            <span className="text-sm font-medium text-text-primary">Extrair do site</span>
            <span className="text-xs text-text-muted text-center">Cole a URL e extraímos cores e fontes automaticamente</span>
          </button>
          <button onClick={() => setMode("manual")} className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border-subtle hover:border-accent-champagne bg-surface-050 transition-colors">
            <Palette className="w-8 h-8 text-accent-champagne" />
            <span className="text-sm font-medium text-text-primary">Configurar manual</span>
            <span className="text-xs text-text-muted text-center">Escolha cores, fontes e faça upload do logo</span>
          </button>
        </div>
        <button onClick={onSkip} className="w-full px-4 py-2 rounded-lg text-text-muted text-sm hover:text-text-secondary">
          Pular — usar padrões do sistema
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {mode === "extract" && !extracted && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-text-primary">URL do seu site</label>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://meusite.com.br"
              className="flex-1 px-3 py-2 rounded-lg bg-surface-050 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
            />
            <button onClick={handleExtract} disabled={!url || extracting} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium disabled:opacity-50">
              {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              Extrair
            </button>
          </div>
          <button onClick={() => setMode("manual")} className="text-xs text-text-muted hover:text-text-secondary">
            Ou configurar manualmente →
          </button>
        </div>
      )}

      {(mode === "manual" || extracted) && (
        <>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-050 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne" />
          </div>

          {/* Cores */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">Cores</label>
            <div className="grid grid-cols-5 gap-3">
              {colorFields.map((cf) => (
                <div key={cf.key} className="text-center">
                  <input
                    type="color"
                    value={colors[cf.key]}
                    onChange={(e) => setColors({ ...colors, [cf.key]: e.target.value })}
                    className="w-full h-10 rounded-lg cursor-pointer border border-border-subtle"
                  />
                  <span className="text-[10px] text-text-muted mt-1 block">{cf.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="flex gap-2">
            {Object.values(colors).map((c, i) => (
              <div key={i} className="flex-1 h-8 rounded" style={{ backgroundColor: c }} title={c} />
            ))}
          </div>

          {/* Fontes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Fonte títulos</label>
              <input value={headingFont} onChange={(e) => setHeadingFont(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-050 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Fonte corpo</label>
              <input value={bodyFont} onChange={(e) => setBodyFont(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-050 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne" />
            </div>
          </div>
        </>
      )}

      {error && <p className="text-sm text-accent-red">{error}</p>}

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? "Salvando..." : "Salvar Brand Kit"}
        </button>
        <button onClick={onSkip} className="px-4 py-2.5 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-200">
          Pular
        </button>
      </div>
    </div>
  );
}

