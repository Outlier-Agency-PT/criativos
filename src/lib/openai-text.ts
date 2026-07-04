/**
 * Client da OpenAI para geração de TEXTO — usado na geração de copy como fallback.
 * Chama a Chat Completions API direto via fetch (sem SDK).
 * Doc: https://platform.openai.com/docs/api-reference/chat
 */

import { ENDPOINTS } from "@/lib/config/endpoints";

const ENDPOINT = ENDPOINTS.OPENAI;
const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Gera texto com a OpenAI. Recebe um prompt único e devolve o texto da resposta.
 * Usado por generateTextWithRotation quando o provider do modelo é "openai".
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
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI erro ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content ?? "";

  if (!text) {
    throw new Error("OpenAI não retornou texto na resposta");
  }
  return text;
}

/** Testa a conexão com a OpenAI (key válida). */
export async function testConnection(
  apiKey: string,
  model: string = DEFAULT_MODEL,
): Promise<boolean> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
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

