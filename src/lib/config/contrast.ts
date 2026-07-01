/**
 * Constantes de contraste para escolha de cor de texto sobre fundo.
 * Centraliza o threshold de luminÃ¢ncia e as cores neutras de texto.
 */
export const CONTRAST = {
  /** Acima deste valor de luminÃ¢ncia (0-1) o fundo Ã© considerado claro. */
  threshold: 0.55,
  /** Texto escuro neutro (usado sobre fundo claro). */
  dark: "#1a1a1a",
  /** Texto claro neutro (usado sobre fundo escuro). */
  light: "#f5f5f5",
} as const;

/**
 * Fallback de marca de ÃšLTIMO RECURSO â€” sÃ³ entra em cena quando a extraÃ§Ã£o
 * de brand falha completamente. SEMPRE prefira as cores reais do brand kit;
 * estas cores sÃ£o genÃ©ricas e existem apenas para nÃ£o quebrar a geraÃ§Ã£o.
 */
export const BRAND_FALLBACK = {
  primary: "#1a237e",
  secondary: "#424242",
  accent: "#ff5722",
  background: "#ffffff",
  text: "#212121",
} as const;

