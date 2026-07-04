import { GoogleGenAI, type Content } from "@google/genai";
import { getImageSize, getTimeout } from "./models";

export interface GenerateCreativeInput {
  templates: Buffer[];
  expertPhotos?: Buffer[];
  /**
   * Foto de fundo própria (modo composição). Quando presente, é anexada como a
   * PRIMEIRA imagem do payload — o prompt instrui o modelo a preservá-la como cena
   * final e só aplicar os textos do template por cima.
   */
  background?: Buffer;
  logo?: Buffer;
  prompt: string;
  aspectRatio?: string;
}

export interface GenerateCreativeResult {
  image: Buffer;
  mimeType: string;
  text: string;
}

/**
 * Gera um criativo usando Google Gemini API.
 * EP08: Aceita model dinâmico + imageConfig com resolução por modelo.
 */
export async function generateCreative(
  apiKey: string,
  input: GenerateCreativeInput,
  model: string = "gemini-2.5-flash"
): Promise<GenerateCreativeResult> {
  const ai = new GoogleGenAI({ apiKey });

  const parts: Content["parts"] = [
    { text: input.prompt },
    // Modo composição: a foto de fundo entra como PRIMEIRA imagem (a "cena final").
    ...(input.background
      ? [{ inlineData: { mimeType: "image/png" as const, data: input.background.toString("base64") } }]
      : []),
    ...input.templates.map((t) => ({
      inlineData: { mimeType: "image/png" as const, data: t.toString("base64") },
    })),
    ...(input.expertPhotos ?? []).map((p) => ({
      inlineData: { mimeType: "image/png" as const, data: p.toString("base64") },
    })),
    ...(input.logo
      ? [{ inlineData: { mimeType: "image/png" as const, data: input.logo.toString("base64") } }]
      : []),
  ];

  const timeout = getTimeout(model);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout: Gemini não respondeu em ${timeout / 1000}s`)), timeout)
  );

  const response = await Promise.race([
    ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["Text", "Image"],
        imageConfig: {
          imageSize: getImageSize(model),
          ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
        },
      },
    }),
    timeoutPromise,
  ]);

  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error("Gemini não retornou candidatos na resposta");
  }

  const responseParts = candidates[0].content?.parts ?? [];
  let image: Buffer | null = null;
  let mimeType = "image/png";
  let text = "";

  for (const part of responseParts) {
    if (part.inlineData) {
      image = Buffer.from(part.inlineData.data!, "base64");
      mimeType = part.inlineData.mimeType ?? "image/png";
    }
    if (part.text) {
      text = part.text;
    }
  }

  if (!image) {
    throw new Error(
      "Gemini não retornou imagem. Verifique se responseModalities inclui 'Image' e se o prompt solicita geração de imagem."
    );
  }

  return { image, mimeType, text };
}

/**
 * Testa conexão com a API do Gemini.
 * EP08: Aceita model dinâmico.
 */
export async function testConnection(apiKey: string, model: string = "gemini-2.5-flash"): Promise<boolean> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: "Responda apenas: OK" }] }],
      config: { responseModalities: ["Text"] },
    });
    return !!response.candidates?.[0]?.content?.parts?.length;
  } catch {
    return false;
  }
}

