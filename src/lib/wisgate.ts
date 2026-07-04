import type { GenerateCreativeInput, GenerateCreativeResult } from "./gemini";
import { getTimeout, isGemini3ImageModel } from "./models";
import { ENDPOINTS } from "@/lib/config/endpoints";

const ENDPOINT = ENDPOINTS.WISGATE_CHAT;
const GEMINI_BASE = ENDPOINTS.WISGATE_GEMINI;

interface WisGateChoice {
  message: {
    content:
      | string
      | Array<{
          type: string;
          text?: string;
          image_url?: { url: string };
        }>;
  };
}

interface WisGateResponse {
  choices: WisGateChoice[];
  error?: { message: string; code: string };
}

/**
 * Gera imagem via endpoint NATIVO Gemini do WisGate (/v1beta/models/{model}:generateContent).
 *
 * IMPORTANTE: os modelos gemini-3-*-image do WisGate dão `model_price_error`
 * ("System busy") no endpoint OpenAI-compat (/v1/chat/completions), mas FUNCIONAM
 * no endpoint Gemini-compat. Por isso Gemini 3 é roteado por aqui.
 */
async function generateCreativeViaGemini(
  apiKey: string,
  input: GenerateCreativeInput,
  model: string
): Promise<GenerateCreativeResult> {
  const parts: Array<Record<string, unknown>> = [{ text: input.prompt }];
  const pushImg = (buf: Buffer) =>
    parts.push({ inlineData: { mimeType: "image/png", data: buf.toString("base64") } });
  // Modo composição: a foto de fundo entra como PRIMEIRA imagem (a "cena final").
  if (input.background) pushImg(input.background);
  input.templates.forEach(pushImg);
  (input.expertPhotos ?? []).forEach(pushImg);
  if (input.logo) pushImg(input.logo);

  const timeout = getTimeout(model);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);

  let response: Response;
  try {
    response = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WisGate (Gemini) erro ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`WisGate (Gemini) API erro: ${data.error.message ?? JSON.stringify(data.error)}`);
  }

  const respParts = data.candidates?.[0]?.content?.parts ?? [];
  let image: Buffer | null = null;
  let mimeType = "image/png";
  let text = "";
  for (const p of respParts) {
    if (p.text) text += p.text;
    const inline = p.inlineData ?? p.inline_data;
    if (inline?.data) {
      mimeType = inline.mimeType ?? inline.mime_type ?? "image/png";
      image = Buffer.from(inline.data, "base64");
    }
  }

  if (!image) {
    throw new Error("WisGate (Gemini) não retornou imagem na resposta.");
  }

  return { image, mimeType, text };
}

/**
 * Gera um criativo usando WisGate.
 * Gemini 3 de imagem usa o endpoint nativo Gemini; demais modelos usam OpenAI-compat.
 */
export async function generateCreative(
  apiKey: string,
  input: GenerateCreativeInput,
  model: string = "gemini-2.5-flash"
): Promise<GenerateCreativeResult> {
  // Gemini 3 de imagem só funciona no endpoint nativo Gemini do WisGate.
  if (isGemini3ImageModel(model)) {
    return generateCreativeViaGemini(apiKey, input, model);
  }

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: input.prompt },
    // Modo composição: a foto de fundo entra como PRIMEIRA imagem (a "cena final").
    ...(input.background
      ? [{ type: "image_url", image_url: { url: `data:image/png;base64,${input.background.toString("base64")}` } }]
      : []),
    ...input.templates.map((t) => ({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${t.toString("base64")}` },
    })),
    ...(input.expertPhotos ?? []).map((p) => ({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${p.toString("base64")}` },
    })),
    ...(input.logo
      ? [{ type: "image_url", image_url: { url: `data:image/png;base64,${input.logo.toString("base64")}` } }]
      : []),
  ];

  const timeout = getTimeout(model);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);

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
        model,
        modalities: ["text", "image"],
        messages: [{ role: "user", content }],
      }),
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WisGate erro ${response.status}: ${errorBody}`);
  }

  const data: WisGateResponse = await response.json();

  if (data.error) {
    throw new Error(`WisGate API erro: ${data.error.message}`);
  }

  if (!data.choices?.length) {
    throw new Error("WisGate não retornou choices na resposta");
  }

  const messageContent = data.choices[0].message.content;

  let image: Buffer | null = null;
  let mimeType = "image/png";
  let text = "";

  // WisGate pode retornar content como string ou array
  if (typeof messageContent === "string") {
    // WisGate pode retornar imagem inline como markdown: ![image](data:image/...;base64,...)
    const mdImageMatch = messageContent.match(/!\[.*?\]\((data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+))\)/);
    if (mdImageMatch) {
      const fullDataUrl = mdImageMatch[1];
      const dataUrlMatch = fullDataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1];
        image = Buffer.from(dataUrlMatch[2], "base64");
      }
    }
    // Também checar data URL direta (sem markdown)
    if (!image) {
      const directMatch = messageContent.match(/data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)/);
      if (directMatch) {
        mimeType = directMatch[1];
        image = Buffer.from(directMatch[2], "base64");
      }
    }
    text = messageContent.replace(/!\[.*?\]\(data:image\/[^)]+\)/, "").trim();
  } else {
    for (const part of messageContent) {
      if (part.type === "text" && part.text) {
        text = part.text;
      }
      if (part.type === "image_url" && part.image_url?.url) {
        const dataUrl = part.image_url.url;
        if (dataUrl.length > 50_000_000) throw new Error("Response image too large");
        const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
        if (match) {
          mimeType = match[1];
          image = Buffer.from(match[2], "base64");
        }
      }
    }
  }

  if (!image) {
    throw new Error(
      "WisGate não retornou imagem na resposta."
    );
  }

  return { image, mimeType, text };
}

/**
 * Testa conexão com WisGate.
 */
export async function testConnection(apiKey: string, model: string = "gemini-2.5-flash"): Promise<boolean> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Responda apenas: OK" }],
        max_tokens: 10,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

