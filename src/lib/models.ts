/**
 * DefiniÃ§Ã£o dos modelos de IA suportados para geraÃ§Ã£o de criativos.
 * Fonte Ãºnica de verdade â€” usada na UI (seletor), API, e rotaÃ§Ã£o de keys.
 */
import { REQUIRED_IMAGE_MODEL } from "@/lib/config/image-models";

export interface AIModel {
  id: string;
  name: string;
  provider: "gemini" | "imagen" | "wisgate" | "openrouter" | "anthropic" | "openai";
  costPerImage: number;
  maxResolution: string;
  imageSize: "1K" | "2K" | "4K";
  freeTier: string | null;
  description: string;
  recommended: boolean;
  supportsImageInput: boolean;
  timeout: number;
}

export const AI_MODELS: AIModel[] = [
  {
    id: REQUIRED_IMAGE_MODEL,
    name: "Nano Banana Pro",
    provider: "gemini",
    // Custo REAL cobrado pela WisGate (fatura 05/06/2026): $0.096/imagem (1K).
    // NÃ£o Ã© o preÃ§o oficial do Google ($0.039) â€” Ã© o que a WisGate cobra de fato.
    costPerImage: 0.096,
    maxResolution: "1K",
    imageSize: "1K",
    freeTier: null,
    description: "O mais avanÃ§ado â€” atÃ© 4K, Google Search em tempo real",
    recommended: true,
    supportsImageInput: true,
    timeout: 90000,
  },
  {
    id: "gemini-2.5-flash-image",
    name: "Nano Banana 2 (Flash)",
    provider: "gemini",
    costPerImage: 0.039,
    maxResolution: "1K",
    imageSize: "1K",
    freeTier: null,
    description: "Bom custo-benefÃ­cio, rÃ¡pido",
    recommended: false,
    supportsImageInput: true,
    timeout: 90000,
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "gemini",
    costPerImage: 0.039,
    maxResolution: "1K",
    imageSize: "1K",
    freeTier: "GrÃ¡tis (quota limitada)",
    description: "Modelo anterior, quota gratuita disponÃ­vel",
    recommended: false,
    supportsImageInput: true,
    timeout: 60000,
  },
  {
    id: "imagen-4-fast",
    name: "Imagen 4 Fast",
    provider: "imagen",
    costPerImage: 0.02,
    maxResolution: "1K",
    imageSize: "1K",
    freeTier: null,
    description: "Mais barato por imagem (sem referÃªncia visual)",
    recommended: false,
    supportsImageInput: false,
    timeout: 60000,
  },
  {
    id: "imagen-4",
    name: "Imagen 4 Standard",
    provider: "imagen",
    costPerImage: 0.04,
    maxResolution: "1K",
    imageSize: "1K",
    freeTier: null,
    description: "EquilÃ­brio qualidade/custo (sem referÃªncia visual)",
    recommended: false,
    supportsImageInput: false,
    timeout: 60000,
  },
  {
    id: "imagen-4-ultra",
    name: "Imagen 4 Ultra",
    provider: "imagen",
    costPerImage: 0.04,
    maxResolution: "1K",
    imageSize: "1K",
    freeTier: null,
    description: "Maior resoluÃ§Ã£o Imagen (sem referÃªncia visual)",
    recommended: false,
    supportsImageInput: false,
    timeout: 90000,
  },
];

export function getModelById(id: string): AIModel | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

export function getDefaultModel(): AIModel {
  return AI_MODELS.find((m) => m.recommended) ?? AI_MODELS[0];
}

export function isImagenModel(modelId: string): boolean {
  return modelId.startsWith("imagen-");
}

/**
 * Modelos Gemini 3 de geraÃ§Ã£o de imagem (ex: gemini-3-pro-image-preview,
 * gemini-3.1-flash-image-preview). SÃ£o os ÃšNICOS aceitos para geraÃ§Ã£o de imagem
 * â€” os demais (Gemini 2.x, Imagen) entregam qualidade inferior.
 */
export function isGemini3ImageModel(modelId: string): boolean {
  return /^gemini-3(\.\d+)?-.*image/i.test(modelId);
}

/**
 * Bloqueio de qualidade: se true, a geraÃ§Ã£o de imagem SÃ“ aceita modelos Gemini 3.
 * Keys com outros modelos sÃ£o ignoradas na rotaÃ§Ã£o de geraÃ§Ã£o de imagem.
 * Ligado por decisÃ£o do usuÃ¡rio (2026-06-02): "se nÃ£o for Gemini 3, nÃ£o usar".
 */
export const REQUIRE_GEMINI3_FOR_IMAGE = true;

export function getImageSize(modelId: string): "1K" | "2K" | "4K" {
  return getModelById(modelId)?.imageSize ?? "1K";
}

/**
 * Custo estimado (USD) por imagem de um modelo, a partir do catÃ¡logo AI_MODELS.
 * Usado para gravar `cost_usd` nos logs de uso (base de billing). Fallback no
 * custo do modelo default (Nano Banana Pro) quando o id nÃ£o estÃ¡ no catÃ¡logo â€”
 * evita registrar custo zero pra um modelo desconhecido.
 */
export function getImageCost(modelId: string | null | undefined): number {
  if (modelId) {
    const model = getModelById(modelId);
    if (model) return model.costPerImage;
  }
  return getDefaultModel().costPerImage;
}

export function getTimeout(modelId: string): number {
  return getModelById(modelId)?.timeout ?? 60000;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * MODELOS DE TEXTO (geraÃ§Ã£o de COPY dos criativos)
 *
 * Separados dos modelos de imagem (AI_MODELS). A copy NÃƒO usa Gemini 3 de
 * imagem â€” usa um LLM de texto barato. O usuÃ¡rio escolhe o primÃ¡rio e a
 * ordem de fallback nas ConfiguraÃ§Ãµes. Default: Haiku â†’ GPT-4o mini â†’ Gemini 2.5 Flash.
 *
 * `provider` aqui aponta pro provider da API key que sabe falar com esse modelo:
 *   - anthropic â†’ key Anthropic (Messages API)
 *   - openai    â†’ key OpenAI (Chat Completions)
 *   - gemini    â†’ key Google Gemini (genai SDK) OU WisGate (relay OpenAI-compat)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export interface TextModel {
  id: string;
  name: string;
  provider: "anthropic" | "openai" | "gemini";
  /** Custo aproximado por 1M tokens de saÃ­da (USD), sÃ³ pra exibir referÃªncia. */
  costPer1MOut: number;
  description: string;
  recommended: boolean;
}

export const TEXT_MODELS: TextModel[] = [
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    costPer1MOut: 4,
    description: "RÃ¡pido e barato, Ã³timo pra copy. Recomendado.",
    recommended: true,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "openai",
    costPer1MOut: 0.6,
    description: "Alternativa barata da OpenAI. Bom fallback.",
    recommended: false,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "gemini",
    costPer1MOut: 2.5,
    description: "Flash do Google. Funciona via key Gemini ou WisGate.",
    recommended: false,
  },
];

/** Ordem de fallback padrÃ£o de modelos de texto (ids). */
export const DEFAULT_TEXT_MODEL_CHAIN: string[] = [
  "claude-haiku-4-5-20251001",
  "gpt-4o-mini",
  "gemini-2.5-flash",
];

export function getTextModelById(id: string): TextModel | undefined {
  return TEXT_MODELS.find((m) => m.id === id);
}

export function getDefaultTextModel(): TextModel {
  return TEXT_MODELS.find((m) => m.recommended) ?? TEXT_MODELS[0];
}

