/**
 * Client da Anthropic (Claude) para geração de TEXTO — usado na geração de copy.
 * Chama a Messages API direto via fetch (sem SDK, pra não adicionar dependência).
 * Doc: https://docs.anthropic.com/en/api/messages
 */

import { ENDPOINTS } from "@/lib/config/endpoints";

const ENDPOINT = ENDPOINTS.ANTHROPIC;
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/**
 * Gera texto com Claude. Recebe um prompt único e devolve o texto da resposta.
 * Usado por generateTextWithRotation quando o provider da key é "anthropic".
 */
export async function generateText(
  apiKey: string,
  prompt: string,
  model: string = DEFAULT_MODEL,
): Promise<string> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 60_000);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic erro ${response.status}: ${err}`);
  }

  const data = await response.json();
  // A resposta vem em data.content: [{ type: "text", text: "..." }, ...]
  const text = Array.isArray(data?.content)
    ? data.content
        .filter((b: { type?: string; text?: string }) => b.type === "text" && typeof b.text === "string")
        .map((b: { text: string }) => b.text)
        .join("")
    : "";

  if (!text) {
    throw new Error("Anthropic não retornou texto na resposta");
  }
  return text;
}

/** Testa a conexão com a Anthropic (key válida). */
export async function testConnection(
  apiKey: string,
  model: string = DEFAULT_MODEL,
): Promise<boolean> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        max_tokens: 8,
        messages: [{ role: "user", content: "Responda apenas: OK" }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

