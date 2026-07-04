import { CONTRAST, BRAND_FALLBACK } from "@/lib/config/contrast";

export interface ExtractedBrand {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  fonts: {
    heading: { family: string; weight: string };
    body: { family: string; weight: string };
  };
  logoUrl: string | null;
}

const COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d[\d.\s,%/]*\)|hsla?\(\s*\d[\d.\s,%/]*\)/g;
const FONT_REGEX = /font-family:\s*['"]?([^'",;}{]+)/gi;
const HSL_VAR_REGEX = /(--[a-zA-Z0-9-]+)\s*:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g;
const HEX_VAR_REGEX = /(--[a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g;

const FETCH_TIMEOUT_MS = 30000;
const MAX_CSS_FILES = 8;
const MAX_CSS_BYTES = 2_500_000;
const USER_AGENT = "CriativosBot/1.0 (brand-extractor)";

const PRIMARY_KEYS = ["primary", "brand", "accent-primary"];
const ACCENT_KEYS = ["accent", "secondary", "highlight", "gold", "brand-accent"];
const BG_KEYS = ["background", "bg", "surface"];
const FG_KEYS = ["foreground", "text", "fg", "content"];
const NOISE_KEYS = ["destructive", "danger", "error", "success", "warning", "info", "ring", "muted"];

// ─────────────────────────────────────────────────────────
// Normalizadores
// ─────────────────────────────────────────────────────────

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function normalizeColor(raw: string): string | null {
  const color = raw.trim().toLowerCase();
  if (color.startsWith("#")) {
    if (color.length === 4) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
    }
    if (color.length === 7) return color;
    if (color.length === 9) return color.slice(0, 7); // descarta alpha
    return null;
  }
  const rgb = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (rgb) return rgbToHex(+rgb[1], +rgb[2], +rgb[3]);
  const hsl = color.match(/hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%/);
  if (hsl) return hslToHex(+hsl[1], +hsl[2], +hsl[3]);
  return null;
}

// ─────────────────────────────────────────────────────────
// Filtros de ruído
// ─────────────────────────────────────────────────────────

function isNoiseColor(hex: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Branco puro / preto puro
  if (r > 248 && g > 248 && b > 248) return true;
  if (r < 8 && g < 8 && b < 8) return true;
  // Cinzas neutros (variação <12 entre canais E luminância média)
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 12 && max > 32 && max < 224) return true;
  return false;
}

function looksLikeErrorRed(hex: string): boolean {
  // Vermelho de erro padrão: #ef4444, #dc2626, #ff5722
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r > 200 && g < 90 && b < 90;
}

// ─────────────────────────────────────────────────────────
// Parsers de CSS
// ─────────────────────────────────────────────────────────

interface CssVars {
  [name: string]: string; // HEX normalizado
}

function parseCssVars(css: string): CssVars {
  const vars: CssVars = {};
  let m: RegExpExecArray | null;
  HSL_VAR_REGEX.lastIndex = 0;
  while ((m = HSL_VAR_REGEX.exec(css)) !== null) {
    const [, name, h, s, l] = m;
    vars[name.toLowerCase()] = hslToHex(+h, +s, +l);
  }
  HEX_VAR_REGEX.lastIndex = 0;
  while ((m = HEX_VAR_REGEX.exec(css)) !== null) {
    const [, name, hex] = m;
    const norm = normalizeColor(hex);
    if (norm) vars[name.toLowerCase()] = norm;
  }
  return vars;
}

function matchVarByKeywords(vars: CssVars, keywords: string[], avoid: string[] = []): string | null {
  // Match exato primeiro
  for (const key of keywords) {
    const exact = `--${key}`;
    if (vars[exact]) return vars[exact];
  }
  // Match parcial (--brand-primary, --color-accent-gold, etc)
  for (const key of keywords) {
    for (const varName of Object.keys(vars)) {
      if (avoid.some((a) => varName.includes(a))) continue;
      if (varName.includes(key)) return vars[varName];
    }
  }
  return null;
}

function rankColors(css: string): Array<{ hex: string; count: number }> {
  const counts = new Map<string, number>();
  const matches = css.match(COLOR_REGEX) || [];
  for (const raw of matches) {
    const hex = normalizeColor(raw);
    if (!hex) continue;
    if (isNoiseColor(hex)) continue;
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count);
}

function extractFontsFromCSS(css: string): string[] {
  const fonts: string[] = [];
  FONT_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FONT_REGEX.exec(css)) !== null) {
    const font = m[1].trim().replace(/["']/g, "");
    const lower = font.toLowerCase();
    if (
      ["inherit", "initial", "unset", "sans-serif", "serif", "monospace", "cursive", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace"].includes(
        lower,
      )
    )
      continue;
    fonts.push(font);
  }
  return [...new Set(fonts)];
}

// ─────────────────────────────────────────────────────────
// Logo + CSS externo
// ─────────────────────────────────────────────────────────

function extractLogoUrl(html: string, baseUrl: string): string | null {
  const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (ogMatch) {
    try {
      return new URL(ogMatch[1], baseUrl).href;
    } catch {}
  }
  // Procura por imagens com "logo" no nome
  const logoImg = html.match(/<img[^>]*src=["']([^"']*logo[^"']*)["']/i);
  if (logoImg) {
    try {
      return new URL(logoImg[1], baseUrl).href;
    } catch {}
  }
  const iconMatch = html.match(/<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i);
  if (iconMatch) {
    try {
      return new URL(iconMatch[1], baseUrl).href;
    } catch {}
  }
  return null;
}

async function fetchWithTimeout(url: string, ms: number): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text.slice(0, MAX_CSS_BYTES);
  } finally {
    clearTimeout(t);
  }
}

function extractStylesheetUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const linkRegex = /<link[^>]+>/gi;
  const links = html.match(linkRegex) || [];
  for (const link of links) {
    const rel = link.match(/rel=["']([^"']+)["']/i);
    if (!rel || !rel[1].toLowerCase().includes("stylesheet")) continue;
    const href = link.match(/href=["']([^"']+)["']/i);
    if (!href) continue;
    try {
      urls.push(new URL(href[1], baseUrl).href);
    } catch {}
  }
  return urls.slice(0, MAX_CSS_FILES);
}

// ─────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────

// fallback de ultimo recurso — use cores reais do brand kit sempre.
// Estas cores genericas so entram quando a extracao de brand falha por completo.
const DEFAULT_FALLBACK: ExtractedBrand = {
  colors: {
    primary: BRAND_FALLBACK.primary,
    secondary: BRAND_FALLBACK.secondary,
    accent: BRAND_FALLBACK.accent,
    background: BRAND_FALLBACK.background,
    text: BRAND_FALLBACK.text,
  },
  fonts: {
    heading: { family: "Inter", weight: "700" },
    body: { family: "Inter", weight: "400" },
  },
  logoUrl: null,
};

export async function extractBrand(url: string): Promise<ExtractedBrand> {
  const { isPublicUrl } = await import("./api-auth");
  if (!isPublicUrl(url)) {
    throw new Error("URL não permitida: apenas URLs públicas são aceitas");
  }

  const html = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);

  // Concatena CSS: inline <style>, atributos style="", e arquivos externos
  const styleBlocks = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [])
    .map((s) => s.replace(/<\/?style[^>]*>/gi, ""))
    .join("\n");
  const inlineStyles = (html.match(/style=["']([^"']+)["']/gi) || []).join("\n");

  const cssUrls = extractStylesheetUrls(html, url);
  const externalCss = await Promise.all(
    cssUrls.map((u) => fetchWithTimeout(u, FETCH_TIMEOUT_MS).catch(() => "")),
  );

  const allCSS = [styleBlocks, inlineStyles, ...externalCss].join("\n");

  // 1) Tenta extrair por CSS variables semânticas (mais confiável)
  const vars = parseCssVars(allCSS);
  const primaryFromVar = matchVarByKeywords(vars, PRIMARY_KEYS, NOISE_KEYS);
  const accentFromVar = matchVarByKeywords(vars, ACCENT_KEYS, NOISE_KEYS);
  const bgFromVar = matchVarByKeywords(vars, BG_KEYS, NOISE_KEYS);
  const fgFromVar = matchVarByKeywords(vars, FG_KEYS, NOISE_KEYS);

  // 2) Fallback / complemento: ranking de frequência
  const ranked = rankColors(allCSS);
  const rankedNoError = ranked.filter((c) => !looksLikeErrorRed(c.hex));

  const used = new Set<string>();
  const pickRanked = (): string | null => {
    for (const c of rankedNoError) {
      if (!used.has(c.hex)) {
        used.add(c.hex);
        return c.hex;
      }
    }
    return null;
  };

  const primary = primaryFromVar || pickRanked() || DEFAULT_FALLBACK.colors.primary;
  used.add(primary);
  const accent = accentFromVar && accentFromVar !== primary ? accentFromVar : pickRanked() || DEFAULT_FALLBACK.colors.accent;
  used.add(accent);
  const secondary = pickRanked() || DEFAULT_FALLBACK.colors.secondary;
  const background = bgFromVar || (rankedNoError.find((c) => isLight(c.hex))?.hex ?? DEFAULT_FALLBACK.colors.background);
  const text = fgFromVar || (isLight(background) ? CONTRAST.dark : CONTRAST.light);

  const fonts = extractFontsFromCSS(allCSS);
  const logoUrl = extractLogoUrl(html, url);

  return {
    colors: { primary, secondary, accent, background, text },
    fonts: {
      heading: { family: fonts[0] || "Inter", weight: "700" },
      body: { family: fonts[1] || fonts[0] || "Inter", weight: "400" },
    },
    logoUrl,
  };
}

function isLight(hex: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > CONTRAST.threshold;
}

