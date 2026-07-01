import { GoogleGenAI } from "@google/genai";
import type { GenerateCreativeInput, GenerateCreativeResult } from "./gemini";
import { getTimeout } from "./models";

/**
 * EP08 S08.4: Client para modelos Imagen 4.
 * Imagen usa generateImages (nÃ£o generateContent).
 * NÃƒO suporta input de imagens â€” somente textoâ†’imagem.
 */
export async function generateCreative(
  apiKey: string,
  input: GenerateCreativeInput,
  model: string = "imagen-4-fast"
): Promise<GenerateCreativeResult> {
  const ai = new GoogleGenAI({ apiKey });

  const timeout = getTimeout(model);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout: Imagen nÃ£o respondeu em ${timeout / 1000}s`)), timeout)
  );

  // Imagen aceita aspectRatio no config
  const aspectRatio = input.aspectRatio ?? "1:1";

  const response = await Promise.race([
    ai.models.generateImages({
      model,
      prompt: input.prompt,
      config: {
        numberOfImages: 1,
        aspectRatio,
      },
    }),
    timeoutPromise,
  ]);

  const images = response.generatedImages;
  if (!images || images.length === 0) {
    throw new Error("Imagen nÃ£o retornou imagens na resposta");
  }

  const imageData = images[0].image;
  if (!imageData?.imageBytes) {
    throw new Error("Imagen retornou resposta sem dados de imagem");
  }

  const image = Buffer.from(imageData.imageBytes, "base64");

  return {
    image,
    mimeType: "image/png",
    text: "",
  };
}

/**
 * Testa conexÃ£o com Imagen 4.
 */
export async function testConnection(apiKey: string, model: string = "imagen-4-fast"): Promise<boolean> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateImages({
      model,
      prompt: "A simple blue circle on white background",
      config: { numberOfImages: 1 },
    });
    return !!(response.generatedImages && response.generatedImages.length > 0);
  } catch {
    return false;
  }
}

