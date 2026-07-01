// EP-13 â€” Modo Lote por Briefing (geraÃ§Ã£o sem template)
// Tipos compartilhados entre parse, build-prompts e generate.

/**
 * Um item extraÃ­do de um briefing markdown. Cada item vira N criativos
 * (um por formato selecionado). `direcao_visual` Ã© a espinha dorsal do
 * prompt; os demais campos sÃ£o o texto que deve aparecer na arte.
 */
export interface BriefingItem {
  /** ID estÃ¡vel dentro do lote (Ã­ndice ou slug do tÃ­tulo). */
  id: string;
  /** TÃ­tulo do bloco (ex.: "EstÃ¡tico 13: RemarcaÃ§Ã£o de agenda"). */
  titulo: string;
  /** Ã‚ngulo estratÃ©gico (A/B/C/D/E), quando presente. */
  angulo?: string;
  /** Headline (Riddle Line) â€” chamada principal. */
  headline?: string;
  /** Subheadline (Sub-riddle Line) â€” apoio. */
  subheadline?: string;
  /** Ponte / chamada â€” corpo que conecta headline ao CTA. */
  ponte?: string;
  /** Call to action â€” vira botÃ£o desenhado na arte. */
  cta?: string;
  /** DireÃ§Ã£o visual textual â€” o conceito visual inteiro. OBRIGATÃ“RIO. */
  direcao_visual: string;
  /** Texto de apoio (primary text do anÃºncio), quando presente. */
  texto_apoio?: string;
  /**
   * Prompt de geraÃ§Ã£o JÃ PRONTO, quando o briefing traz um (ex: bloco ``` com
   * ESTILO/FUNDO/PALETA/COMPOSIÃ‡ÃƒO escrito Ã  mÃ£o). Quando presente, o sistema
   * usa este prompt DIRETO em vez de re-gerar a partir da direÃ§Ã£o visual.
   */
  prompt_pronto?: string;
}

/** Um prompt gerado para um item Ã— formato. */
export interface BriefingPrompt {
  itemId: string;
  /** DireÃ§Ã£o visual do item de origem (carregada para gravar em visual_direction). */
  visualDirection: string;
  formatLabel: string;
  width: number;
  height: number;
  /** Prompt final pro Nano Banana (editÃ¡vel pelo usuÃ¡rio antes de gerar). */
  prompt: string;
}

/** Formato de saÃ­da selecionado para o lote. */
export interface BriefingFormat {
  width: number;
  height: number;
  label: string;
}

