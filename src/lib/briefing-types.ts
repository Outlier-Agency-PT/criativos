// EP-13 — Modo Lote por Briefing (geração sem template)
// Tipos compartilhados entre parse, build-prompts e generate.

/**
 * Um item extraído de um briefing markdown. Cada item vira N criativos
 * (um por formato selecionado). `direcao_visual` é a espinha dorsal do
 * prompt; os demais campos são o texto que deve aparecer na arte.
 */
export interface BriefingItem {
  /** ID estável dentro do lote (índice ou slug do título). */
  id: string;
  /** Título do bloco (ex.: "Estático 13: Remarcação de agenda"). */
  titulo: string;
  /** Ângulo estratégico (A/B/C/D/E), quando presente. */
  angulo?: string;
  /** Headline (Riddle Line) — chamada principal. */
  headline?: string;
  /** Subheadline (Sub-riddle Line) — apoio. */
  subheadline?: string;
  /** Ponte / chamada — corpo que conecta headline ao CTA. */
  ponte?: string;
  /** Call to action — vira botão desenhado na arte. */
  cta?: string;
  /** Direção visual textual — o conceito visual inteiro. OBRIGATÓRIO. */
  direcao_visual: string;
  /** Texto de apoio (primary text do anúncio), quando presente. */
  texto_apoio?: string;
  /**
   * Prompt de geração JÁ PRONTO, quando o briefing traz um (ex: bloco ``` com
   * ESTILO/FUNDO/PALETA/COMPOSIÇÃO escrito à mão). Quando presente, o sistema
   * usa este prompt DIRETO em vez de re-gerar a partir da direção visual.
   */
  prompt_pronto?: string;
}

/** Um prompt gerado para um item × formato. */
export interface BriefingPrompt {
  itemId: string;
  /** Direção visual do item de origem (carregada para gravar em visual_direction). */
  visualDirection: string;
  formatLabel: string;
  width: number;
  height: number;
  /** Prompt final pro Nano Banana (editável pelo usuário antes de gerar). */
  prompt: string;
}

/** Formato de saída selecionado para o lote. */
export interface BriefingFormat {
  width: number;
  height: number;
  label: string;
}

