/**
 * Modelo de imagem obrigatório (Nano Banana Pro / Gemini 3).
 * Centraliza a string cravada que aparece nos endpoints e na rotação de keys.
 */
export const REQUIRED_IMAGE_MODEL = "gemini-3-pro-image-preview";

/** Verifica se o modelo informado é o modelo de imagem obrigatório. */
export function isRequiredImageModel(model: string | null | undefined): boolean {
  return model === REQUIRED_IMAGE_MODEL;
}

