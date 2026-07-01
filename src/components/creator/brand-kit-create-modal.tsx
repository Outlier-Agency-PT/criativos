"use client";


import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Portal } from "./portal";

const GOOGLE_FONTS = [
  "Inter", "Montserrat", "Playfair Display", "Roboto", "Lato",
  "Poppins", "Oswald", "Merriweather", "Open Sans", "Raleway",
];

interface BrandKitCreateModalProps {
  orgId: string;
  onClose: () => void;
  onCreated: (brandKit: { id: string; name: string }) => void;
}

function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-text-muted">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-border-subtle cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className={cn(
            "flex-1 px-3 py-1.5 text-sm rounded-lg border bg-surface-050 text-text-primary",
            isValidHex(value) ? "border-border-subtle" : "border-accent-red"
          )}
        />
      </div>
    </div>
  );
}

export function BrandKitCreateModal({ orgId, onClose, onCreated }: BrandKitCreateModalProps) {
  const [name, setName] = useState("");
  const [primary, setPrimary] = useState("#000000");
  const [secondary, setSecondary] = useState("#666666");
  const [accent, setAccent] = useState("#d4a574");
  const [headingFont, setHeadingFont] = useState("Inter");
  const [bodyFont, setBodyFont] = useState("Inter");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URL extraction state
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [extractUrl, setExtractUrl] = useState("");
  const [extracting, setExtracting] = useState(false);

  async function handleExtractUrl() {
    if (!extractUrl) return;
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch("/api/brand-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: extractUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.colors?.primary) setPrimary(data.colors.primary);
      if (data.colors?.secondary) setSecondary(data.colors.secondary);
      if (data.colors?.accent) setAccent(data.colors.accent);
      if (data.fonts?.heading) setHeadingFont(typeof data.fonts.heading === "object" ? data.fonts.heading.family : data.fonts.heading);
      if (data.fonts?.body) setBodyFont(typeof data.fonts.body === "object" ? data.fonts.body.family : data.fonts.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na extraÃ§Ã£o");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    setError(null);

    if (!name.trim()) {
      setError("Nome obrigatÃ³rio");
      return;
    }
    if (!isValidHex(primary) || !isValidHex(secondary) || !isValidHex(accent)) {
      setError("Cores devem estar no formato #RRGGBB");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/brand-kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          name: name.trim(),
          colors: { primary, secondary, accent },
          fonts: {
            heading: { family: headingFont, weight: "700" },
            body: { family: bodyFont, weight: "400" },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      onCreated({ id: data.brandKit.id, name: data.brandKit.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface-100 rounded-2xl border border-border-subtle w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-text-primary">Criar Brand Kit</h2>
          <button onClick={onClose} className="p-1 hover:bg-surface-200 rounded-lg transition-colors">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Nome */}
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Nome *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Meu brand kit"
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
            />
          </div>

          {/* Cores */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-secondary">Cores *</p>
            <div className="grid grid-cols-3 gap-3">
              <ColorInput label="PrimÃ¡ria" value={primary} onChange={setPrimary} />
              <ColorInput label="SecundÃ¡ria" value={secondary} onChange={setSecondary} />
              <ColorInput label="Accent" value={accent} onChange={setAccent} />
            </div>
          </div>

          {/* Fontes */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-secondary">Fontes (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Heading</label>
                <select
                  value={headingFont}
                  onChange={(e) => setHeadingFont(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
                >
                  {GOOGLE_FONTS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Body</label>
                <select
                  value={bodyFont}
                  onChange={(e) => setBodyFont(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
                >
                  {GOOGLE_FONTS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Extrair de URL */}
          <div className="space-y-2">
            {!showUrlInput ? (
              <button
                onClick={() => setShowUrlInput(true)}
                className="text-xs text-accent-champagne hover:underline"
              >
                Extrair de URL
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  type="url"
                  value={extractUrl}
                  onChange={(e) => setExtractUrl(e.target.value)}
                  placeholder="https://meusite.com"
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-050 text-text-primary"
                />
                <button
                  onClick={handleExtractUrl}
                  disabled={extracting || !extractUrl}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-champagne text-surface-900 disabled:opacity-50"
                >
                  {extracting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Extrair"}
                </button>
              </div>
            )}
          </div>

          {/* Error */}
          {error && <p className="text-xs text-accent-red">{error}</p>}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border-subtle text-text-secondary hover:bg-surface-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-champagne text-surface-900 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </button>
        </div>
      </div>
      </div>
    </Portal>
  );
}

