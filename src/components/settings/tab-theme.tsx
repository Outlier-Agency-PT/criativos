"use client";


import { useTheme } from "@/components/theme-provider";
import { THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { Check, Paintbrush } from "lucide-react";

export function TabTheme() {
  const { themeId, setTheme, loading } = useTheme();

  if (loading) {
    return <div className="text-sm text-text-muted py-8 text-center">Carregando tema...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Paintbrush className="w-5 h-5" />
          Aparencia
        </h3>
        <p className="text-sm text-text-muted mt-1">
          Escolha o tema visual do seu workspace. A mudanca e aplicada instantaneamente.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {THEMES.map((theme) => {
          const isActive = themeId === theme.id;
          return (
            <button
              key={theme.id}
              onClick={() => setTheme(theme.id as ThemeId)}
              className={cn(
                "relative p-5 text-left transition-all",
                "bg-[var(--surface-100)] border",
                isActive
                  ? "border-[var(--accent)] shadow-[0_0_20px_var(--accent-alpha-15)]"
                  : "border-[var(--border-subtle)] hover:border-[var(--border-default)]"
              )}
            >
              {isActive && (
                <div className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center bg-[var(--accent)] text-black">
                  <Check className="w-4 h-4" />
                </div>
              )}

              {/* Color preview */}
              <div className="flex gap-2 mb-4">
                <div
                  className="w-10 h-10 border border-white/10"
                  style={{ background: theme.surface000 }}
                />
                <div
                  className="w-10 h-10 border border-white/10"
                  style={{ background: theme.surface100 }}
                />
                <div
                  className="w-10 h-10 border border-white/10"
                  style={{
                    background: theme.accent,
                    boxShadow: `0 0 12px ${theme.accent}44`,
                  }}
                />
                <div
                  className="w-10 h-10 border border-white/10"
                  style={{ background: theme.accentLight }}
                />
                <div
                  className="w-10 h-10 border border-white/10"
                  style={{ background: theme.accentDark }}
                />
              </div>

              {/* Mini preview bar */}
              <div className="h-1 w-full mb-4" style={{
                background: `linear-gradient(90deg, ${theme.accent}, ${theme.accentLight})`,
                boxShadow: `0 0 8px ${theme.accent}33`,
              }} />

              <div className="text-sm font-semibold text-text-primary">{theme.name}</div>
              <div className="text-xs text-text-muted mt-1">{theme.description}</div>
            </button>
          );
        })}
      </div>

      <div className="text-xs text-text-muted pt-4 border-t border-[var(--border-subtle)]">
        O tema selecionado e salvo automaticamente e aplicado para todos os membros da organizacao.
      </div>
    </div>
  );
}

