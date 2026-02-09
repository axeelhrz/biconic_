import crypto from "crypto";

const ALG = "aes-256-gcm";
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const SALT_LEN = 32;
const KEY_LEN = 32;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error(
      "ENCRYPTION_KEY debe estar definida en .env con al menos 32 caracteres para guardar contraseñas de conexiones."
    );
  }
  return crypto.scryptSync(raw, "connection-secret", KEY_LEN);
}

/**
 * Cifra la contraseña de una conexión para guardarla en la base.
 */
export function encryptConnectionPassword(plain: string): string {
  if (!plain) return "";
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/**
 * Descifra la contraseña guardada en db_password_encrypted.
 */
export function decryptConnectionPassword(encrypted: string | null | undefined): string {
  if (!encrypted) return "";
  try {
    const key = getKey();
    const buf = Buffer.from(encrypted, "base64");
    if (buf.length < IV_LEN + AUTH_TAG_LEN) return "";
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
    const data = buf.subarray(IV_LEN + AUTH_TAG_LEN);
    const decipher = crypto.createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data, undefined, "utf8") + decipher.final("utf8");
  } catch {
    return "";
  }
}
