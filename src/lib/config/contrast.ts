/**
 * Constantes de contraste para escolha de cor de texto sobre fundo.
 * Centraliza o threshold de luminância e as cores neutras de texto.
 */
export const CONTRAST = {
  /** Acima deste valor de luminância (0-1) o fundo é considerado claro. */
  threshold: 0.55,
  /** Texto escuro neutro (usado sobre fundo claro). */
  dark: "#1a1a1a",
  /** Texto claro neutro (usado sobre fundo escuro). */
  light: "#f5f5f5",
} as const;

/**
 * Fallback de marca de ÚLTIMO RECURSO — só entra em cena quando a extração
 * de brand falha completamente. SEMPRE prefira as cores reais do brand kit;
 * estas cores são genéricas e existem apenas para não quebrar a geração.
 */
export const BRAND_FALLBACK = {
  primary: "#1a237e",
  secondary: "#424242",
  accent: "#ff5722",
  background: "#ffffff",
  text: "#212121",
} as const;

