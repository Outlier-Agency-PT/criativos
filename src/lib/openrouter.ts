import type { GenerateCreativeInput, GenerateCreativeResult } from "./gemini";
import { getTimeout } from "./models";
import { ENDPOINTS } from "@/lib/config/endpoints";

const ENDPOINT = ENDPOINTS.OPENROUTER;

interface OpenRouterChoice {
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

interface OpenRouterResponse {
  choices: OpenRouterChoice[];
  error?: { message: string; code: number };
}

/**
 * Mapeia model ID interno para formato OpenRouter.
 * Ex: 'gemini-3.1-flash-image-preview' â†’ 'google/gemini-3.1-flash-image-preview'
 */
function toOpenRouterModel(model: string): string {
  if (model.startsWith("google/")) return model;
  return `google/${model}`;
}

/**
 * Gera um criativo usando OpenRouter como fallback.
 * EP08: Aceita model dinÃ¢mico com prefixo google/ automÃ¡tico.
 */
export async function generateCreative(
  apiKey: string,
  input: GenerateCreativeInput,
  model: string = "gemini-2.5-flash"
): Promise<GenerateCreativeResult> {
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: input.prompt },
    // Modo composiÃ§Ã£o: a foto de fundo entra como PRIMEIRA imagem (a "cena final").
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
        model: toOpenRouterModel(model),
        modalities: ["text", "image"],
        messages: [{ role: "user", content }],
      }),
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter erro ${response.status}: ${errorBody}`);
  }

  const data: OpenRouterResponse = await response.json();

  if (data.error) {
    throw new Error(`OpenRouter API erro: ${data.error.message}`);
  }

  if (!data.choices?.length) {
    throw new Error("OpenRouter nÃ£o retornou choices na resposta");
  }

  const messageContent = data.choices[0].message.content;
  let image: Buffer | null = null;
  let mimeType = "image/png";
  let text = "";

  // OpenRouter pode retornar content como string ou array
  if (typeof messageContent === "string") {
    // Pode retornar imagem inline como markdown: ![image](data:image/...;base64,...)
    const mdImageMatch = messageContent.match(/!\[.*?\]\((data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+))\)/);
    if (mdImageMatch) {
      const fullDataUrl = mdImageMatch[1];
      const dataUrlMatch = fullDataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1];
        image = Buffer.from(dataUrlMatch[2], "base64");
      }
    }
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
      "OpenRouter nÃ£o retornou imagem. Verifique se modalities inclui 'image'."
    );
  }

  return { image, mimeType, text };
}

/**
 * Testa conexÃ£o com OpenRouter.
 * EP08: Aceita model dinÃ¢mico.
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
        model: toOpenRouterModel(model),
        messages: [{ role: "user", content: "Responda apenas: OK" }],
        max_tokens: 10,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

