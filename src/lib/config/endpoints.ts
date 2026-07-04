/**
 * Endpoints externos centralizados.
 * Fonte única de verdade — substitui literais espalhados pelos clients.
 * Cada um pode ser sobrescrito por variável de ambiente.
 */
export const ENDPOINTS = {
  /** WisGate — Chat Completions (OpenAI-compat). */
  WISGATE_CHAT: process.env.WISGATE_CHAT_URL || "https://api.wisgate.ai/v1/chat/completions",
  /** WisGate — base dos modelos Gemini (relay v1beta). */
  WISGATE_GEMINI: process.env.WISGATE_GEMINI_URL || "https://api.wisgate.ai/v1beta/models",
  /** OpenRouter — Chat Completions (OpenAI-compat). */
  OPENROUTER: process.env.OPENROUTER_URL || "https://openrouter.ai/api/v1/chat/completions",
  /** Anthropic — Messages API. */
  ANTHROPIC: process.env.ANTHROPIC_URL || "https://api.anthropic.com/v1/messages",
  /** OpenAI — Chat Completions. */
  OPENAI: process.env.OPENAI_URL || "https://api.openai.com/v1/chat/completions",
} as const;

/** Identificador de cliente HTTP enviado em integrações de relay (User-Agent / x-client). */
export const HTTP_CLIENT_ID = "criativos-torriani/1.0";

