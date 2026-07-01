/**
 * Modelo de imagem obrigatÃ³rio (Nano Banana Pro / Gemini 3).
 * Centraliza a string cravada que aparece nos endpoints e na rotaÃ§Ã£o de keys.
 */
export const REQUIRED_IMAGE_MODEL = "gemini-3-pro-image-preview";

/** Verifica se o modelo informado Ã© o modelo de imagem obrigatÃ³rio. */
export function isRequiredImageModel(model: string | null | undefined): boolean {
  return model === REQUIRED_IMAGE_MODEL;
}

