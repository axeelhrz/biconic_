/** Debe coincidir con backend y `.env.local`. */
export const JWT_SECRET_FALLBACK = "dev-jwt-secret-change-me-32chars!!";

export function getJwtSecretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? JWT_SECRET_FALLBACK);
}
