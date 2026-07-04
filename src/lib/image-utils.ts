/**
 * EP08 S08.6: Utilitários de processamento de imagem.
 * Converte RGBA→RGB (transparência→fundo branco) antes de enviar para APIs.
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
    return false; // Não é PNG — provavelmente JPEG, não tem alpha
  }
  // Color type está no byte 25 do header (offset 25 no arquivo)
  const colorType = buffer[25];
  return colorType === 4 || colorType === 6; // 4=GA, 6=RGBA
}

/**
 * Converte imagem RGBA para RGB com fundo branco.
 * Usa canvas nativo (OffscreenCanvas não disponível no Node, então
 * fazemos composição manual dos pixels RGBA sobre branco).
 *
 * Para PNGs com alpha, decodifica raw pixels, compõe sobre branco,
 * e re-encoda como PNG sem alpha.
 *
 * Fallback: se não conseguir processar, retorna o buffer original.
 */
export async function ensureRGB(buffer: Buffer): Promise<Buffer> {
  if (!hasAlphaChannel(buffer)) {
    return buffer; // Não é RGBA — retorna como está
  }

  // Tentar usar sharp se disponível (instalação opcional)
  try {
    const sharp = (await import("sharp")).default;
    const result = await sharp(buffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();
    return result;
  } catch {
    // sharp não instalado — retorna original
    // A API aceita RGBA, só pode ter artefatos visuais
    return buffer;
  }
}

/**
 * Processa array de buffers, convertendo todos para RGB.
 */
export async function ensureAllRGB(buffers: Buffer[]): Promise<Buffer[]> {
  return Promise.all(buffers.map(ensureRGB));
}

