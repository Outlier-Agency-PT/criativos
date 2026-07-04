import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY não configurada ou inválida. Deve ter 64 caracteres hex (32 bytes)."
    );
  }
  return Buffer.from(key, "hex");
}

/**
 * Criptografa uma API key usando AES-256-GCM.
 * Retorna string no formato: iv:authTag:ciphertext (base64)
 */
export function encryptKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted,
  ].join(":");
}

/**
 * Descriptografa uma API key criptografada com encryptKey().
 * Espera string no formato: iv:authTag:ciphertext (base64)
 */
export function decryptKey(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Formato de key criptografada inválido. Esperado: iv:authTag:ciphertext");
  }

  const [ivB64, authTagB64, ciphertext] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error(`IV inválido: esperado ${IV_LENGTH} bytes, recebido ${iv.length}`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`AuthTag inválido: esperado ${AUTH_TAG_LENGTH} bytes, recebido ${authTag.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

