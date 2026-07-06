export type ThemeId = "cyan" | "Outlier Agency-blue" | "classic-blue" | "verde-premium";

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  accent: string;
  accentLight: string;
  accentDark: string;
  accentRgb: string;
  preview: string;
  surface000: string;
  surface050: string;
  surface100: string;
  surface150: string;
  surface200: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  pageBackground: string;
  pageGlow: string;
  gridDotColor: string;
  shellBackground: string;
  shellBorder: string;
  shellShadow: string;
  sidebarBackground: string;
  panelBackground: string;
  panelBackgroundStrong: string;
  panelShadow: string;
  panelShadowHover: string;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "cyan",
    name: "Cyan",
    description: "Cristalino, preciso, premium tech",
    accent: "#22d3ee",
    accentLight: "#67e8f9",
    accentDark: "#0e7490",
    accentRgb: "34,211,238",
    preview: "#22d3ee",
    surface000: "#040608",
    surface050: "#080e12",
    surface100: "#0c141a",
    surface150: "#121c24",
    surface200: "#18242d",
    textPrimary: "#ffffff",
    textSecondary: "#d6e3ea",
    textMuted: "#7e95a7",
    pageBackground: "radial-gradient(ellipse 82% 64% at 16% 12%, rgba(34,211,238,0.07) 0%, transparent 38%), radial-gradient(ellipse 62% 54% at 74% 18%, rgba(103,232,249,0.06) 0%, transparent 34%), linear-gradient(180deg, #080d12 0%, #040608 100%)",
    pageGlow: "linear-gradient(180deg, rgba(103,232,249,0.04) 0%, rgba(4,6,8,0) 38%)",
    gridDotColor: "rgba(34,211,238,0.05)",
    shellBackground: "radial-gradient(circle at 16% 12%, rgba(34,211,238,0.10), transparent 34%), radial-gradient(circle at 72% 22%, rgba(103,232,249,0.10), transparent 30%), linear-gradient(180deg, rgba(10,21,30,0.88), rgba(4,8,12,0.98))",
    shellBorder: "rgba(103,232,249,0.11)",
    shellShadow: "0 32px 110px rgba(0,0,0,0.72)",
    sidebarBackground: "linear-gradient(180deg, rgba(34,211,238,0.08), rgba(5,12,16,0.08)), linear-gradient(180deg, rgba(10,18,26,0.96), rgba(5,10,14,0.98))",
    panelBackground: "linear-gradient(180deg, rgba(34,211,238,0.055), rgba(255,255,255,0)), linear-gradient(180deg, rgba(16,30,42,0.90), rgba(8,13,18,0.94))",
    panelBackgroundStrong: "linear-gradient(145deg, rgba(34,211,238,0.11) 0%, rgba(34,211,238,0.04) 48%, rgba(8,13,18,0.94) 100%)",
    panelShadow: "0 18px 44px rgba(0,0,0,0.38)",
    panelShadowHover: "0 26px 54px rgba(0,0,0,0.46), 0 0 24px rgba(34,211,238,0.08)",
  },
  {
    id: "Outlier Agency-blue",
    name: "Outlier Agency Blue",
    description: "Azul da marca. Vibrante, confiante, profissional",
    accent: "#2B7DE1",
    accentLight: "#5a9ef0",
    accentDark: "#003A70",
    accentRgb: "43,125,225",
    preview: "#2B7DE1",
    surface000: "#000000",
    surface050: "#060608",
    surface100: "#0c0c0e",
    surface150: "#141416",
    surface200: "#1c1c1e",
    textPrimary: "#ffffff",
    textSecondary: "#c9d1d9",
    textMuted: "#8b949e",
    pageBackground: "#000000",
    pageGlow: "linear-gradient(180deg, rgba(43,125,225,0.03) 0%, rgba(0,0,0,0) 35%)",
    gridDotColor: "rgba(43,125,225,0.04)",
    shellBackground: "rgba(10,12,16,0.72)",
    shellBorder: "rgba(255,255,255,0.08)",
    shellShadow: "0 30px 100px rgba(0,0,0,0.65)",
    sidebarBackground: "rgba(6,8,12,0.92)",
    panelBackground: "rgba(255,255,255,0.02)",
    panelBackgroundStrong: "rgba(255,255,255,0.03)",
    panelShadow: "0 14px 32px rgba(0,0,0,0.28)",
    panelShadowHover: "0 18px 38px rgba(0,0,0,0.36)",
  },
  {
    id: "classic-blue",
    name: "Classic",
    description: "Tema padrao com azul Outlier Agency. Solido, premium",
    accent: "#2B7DE1",
    accentLight: "#5a9ef0",
    accentDark: "#003A70",
    accentRgb: "43,125,225",
    preview: "#003A70",
    surface000: "#020408",
    surface050: "#060a10",
    surface100: "#0a1018",
    surface150: "#0e1620",
    surface200: "#141c28",
    textPrimary: "#ffffff",
    textSecondary: "#c9d1d9",
    textMuted: "#8b949e",
    pageBackground: "radial-gradient(ellipse 80% 60% at 70% 20%, rgba(43,125,225,0.06) 0%, transparent 50%), radial-gradient(ellipse 60% 50% at 20% 80%, rgba(0,58,112,0.05) 0%, transparent 50%), #020408",
    pageGlow: "linear-gradient(180deg, rgba(90,158,240,0.04) 0%, rgba(2,4,8,0) 35%)",
    gridDotColor: "rgba(43,125,225,0.04)",
    shellBackground: "rgba(4,10,20,0.7)",
    shellBorder: "rgba(43,125,225,0.10)",
    shellShadow: "0 30px 100px rgba(0,0,0,0.7)",
    sidebarBackground: "rgba(2,4,10,0.9)",
    panelBackground: "rgba(43,125,225,0.03)",
    panelBackgroundStrong: "linear-gradient(145deg, rgba(43,125,225,0.12) 0%, rgba(43,125,225,0.03) 60%, rgba(0,0,0,0.3) 100%)",
    panelShadow: "0 18px 40px rgba(0,0,0,0.35)",
    panelShadowHover: "0 24px 48px rgba(0,0,0,0.45), 0 0 24px rgba(43,125,225,0.08)",
  },
  {
    id: "verde-premium",
    name: "Verde Premium",
    description: "Verde atmosferico. Profundo, vivo, landing pages",
    accent: "#10b950",
    accentLight: "#4ade80",
    accentDark: "#0a7a35",
    accentRgb: "16,185,80",
    preview: "#10b950",
    surface000: "#020604",
    surface050: "#060a06",
    surface100: "#0a120a",
    surface150: "#0e1a0e",
    surface200: "#142014",
    textPrimary: "#ffffff",
    textSecondary: "#cfe0d3",
    textMuted: "#7d9482",
    pageBackground: "radial-gradient(ellipse 80% 60% at 70% 20%, rgba(16,185,80,0.06) 0%, transparent 50%), radial-gradient(ellipse 60% 50% at 20% 80%, rgba(16,185,80,0.04) 0%, transparent 50%), #060a06",
    pageGlow: "linear-gradient(180deg, rgba(74,222,128,0.04) 0%, rgba(6,10,6,0) 35%)",
    gridDotColor: "rgba(74,222,128,0.04)",
    shellBackground: "rgba(10,18,10,0.72)",
    shellBorder: "rgba(16,185,80,0.10)",
    shellShadow: "0 30px 100px rgba(0,0,0,0.7)",
    sidebarBackground: "rgba(4,8,4,0.9)",
    panelBackground: "rgba(16,185,80,0.03)",
    panelBackgroundStrong: "linear-gradient(145deg, rgba(16,185,80,0.12) 0%, rgba(16,185,80,0.03) 60%, rgba(0,0,0,0.3) 100%)",
    panelShadow: "0 18px 40px rgba(0,0,0,0.35)",
    panelShadowHover: "0 24px 48px rgba(0,0,0,0.45), 0 0 24px rgba(16,185,80,0.08)",
  },
];

export function getThemeById(id: string): ThemeDefinition {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

export function getThemeCSSVars(theme: ThemeDefinition): Record<string, string> {
  return {
    "--accent": theme.accent,
    "--accent-light": theme.accentLight,
    "--accent-dark": theme.accentDark,
    "--accent-rgb": theme.accentRgb,

    // Surfaces — each theme variant gets its own tint
    "--surface-000": theme.surface000,
    "--surface-050": theme.surface050,
    "--surface-100": theme.surface100,
    "--surface-150": theme.surface150,
    "--surface-200": theme.surface200,

    // Borders — white neutral
    "--border-subtle": "rgba(255,255,255,0.08)",
    "--border-default": "rgba(255,255,255,0.12)",
    "--border-accent": theme.accent,

    // Text — cool gray, zero warm
    "--text-primary": theme.textPrimary,
    "--text-secondary": theme.textSecondary,
    "--text-muted": theme.textMuted,
    "--text-accent": theme.accent,
    "--page-background": theme.pageBackground,
    "--page-glow": theme.pageGlow,
    "--grid-dot-color": theme.gridDotColor,
    "--shell-background": theme.shellBackground,
    "--shell-border": theme.shellBorder,
    "--shell-shadow": theme.shellShadow,
    "--sidebar-background": theme.sidebarBackground,
    "--panel-background": theme.panelBackground,
    "--panel-background-strong": theme.panelBackgroundStrong,
    "--panel-shadow": theme.panelShadow,
    "--panel-shadow-hover": theme.panelShadowHover,

    // Accent alphas
    "--accent-alpha-05": `rgba(${theme.accentRgb},0.05)`,
    "--accent-alpha-08": `rgba(${theme.accentRgb},0.08)`,
    "--accent-alpha-10": `rgba(${theme.accentRgb},0.10)`,
    "--accent-alpha-12": `rgba(${theme.accentRgb},0.12)`,
    "--accent-alpha-15": `rgba(${theme.accentRgb},0.15)`,
    "--accent-alpha-20": `rgba(${theme.accentRgb},0.20)`,

    // Legacy compat
    "--accent-champagne": theme.accent,
    "--accent-gold-warm": theme.accentDark,
    "--champagne-alpha-05": `rgba(${theme.accentRgb},0.05)`,
    "--champagne-alpha-08": `rgba(${theme.accentRgb},0.08)`,
    "--champagne-alpha-10": `rgba(${theme.accentRgb},0.10)`,
    "--champagne-alpha-12": `rgba(${theme.accentRgb},0.12)`,
    "--champagne-alpha-15": `rgba(${theme.accentRgb},0.15)`,
    "--champagne-alpha-20": `rgba(${theme.accentRgb},0.20)`,
    "--champagne-alpha-25": `rgba(${theme.accentRgb},0.25)`,
    "--champagne-alpha-30": `rgba(${theme.accentRgb},0.30)`,
    "--champagne-alpha-40": `rgba(${theme.accentRgb},0.40)`,

    // Semantic colors (shared)
    "--accent-green": "#34d399",
    "--accent-green-dim": "rgba(52,211,153,0.12)",
    "--accent-red": "#f87171",
    "--accent-red-dim": "rgba(248,113,113,0.12)",
    "--accent-blue": "#60a5fa",
    "--accent-purple": "#a78bfa",
    "--accent-yellow": "#fbbf24",

    // Gradient
    "--gradient-cta": `linear-gradient(135deg, ${theme.accent}, ${theme.accentLight})`,
    "--glow-cta": `0 4px 24px rgba(${theme.accentRgb},0.25), 0 0 50px rgba(${theme.accentRgb},0.08)`,

    // Shadows
    "--shadow-sm": "0 1px 2px rgba(0,0,0,0.4)",
    "--shadow-md": "0 4px 6px rgba(0,0,0,0.5)",
    "--shadow-lg": "0 10px 15px rgba(0,0,0,0.6)",
    "--shadow-accent-glow": `0 0 20px rgba(${theme.accentRgb},0.15)`,
  };
}

