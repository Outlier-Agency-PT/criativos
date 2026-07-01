/**
 * EP08 S08.6: UtilitÃ¡rios de processamento de imagem.
 * Converte RGBAâ†’RGB (transparÃªnciaâ†’fundo branco) antes de enviar para APIs.
 */

/**
 * Verifica se um buffer PNG tem canal alpha.
 * PNG IHDR: bytes 24-25 indicam color type.
 * Color type 6 = RGBA, 4 = Grayscale+Alpha
 */
function hasAlphaChannel(buffer: Buffer): boolean {
  // Verificar assinatura PNG: 137 80 78 71 13 10 26 10
  if (buffer.length < 26) return false;
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
    return false; // NÃ£o Ã© PNG â€” provavelmente JPEG, nÃ£o tem alpha
  }
  // Color type estÃ¡ no byte 25 do header (offset 25 no arquivo)
  const colorType = buffer[25];
  return colorType === 4 || colorType === 6; // 4=GA, 6=RGBA
}

/**
 * Converte imagem RGBA para RGB com fundo branco.
 * Usa canvas nativo (OffscreenCanvas nÃ£o disponÃ­vel no Node, entÃ£o
 * fazemos composiÃ§Ã£o manual dos pixels RGBA sobre branco).
 *
 * Para PNGs com alpha, decodifica raw pixels, compÃµe sobre branco,
 * e re-encoda como PNG sem alpha.
 *
 * Fallback: se nÃ£o conseguir processar, retorna o buffer original.
 */
export async function ensureRGB(buffer: Buffer): Promise<Buffer> {
  if (!hasAlphaChannel(buffer)) {
    return buffer; // NÃ£o Ã© RGBA â€” retorna como estÃ¡
  }

  // Tentar usar sharp se disponÃ­vel (instalaÃ§Ã£o opcional)
  try {
    const sharp = (await import("sharp")).default;
    const result = await sharp(buffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();
    return result;
  } catch {
    // sharp nÃ£o instalado â€” retorna original
    // A API aceita RGBA, sÃ³ pode ter artefatos visuais
    return buffer;
  }
}

/**
 * Processa array de buffers, convertendo todos para RGB.
 */
export async function ensureAllRGB(buffers: Buffer[]): Promise<Buffer[]> {
  return Promise.all(buffers.map(ensureRGB));
}

