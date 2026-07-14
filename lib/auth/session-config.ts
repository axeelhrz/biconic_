const DURATION_RE = /^(\d+)(s|m|h|d)$/i;

export function parseDurationMs(value: string | undefined, fallbackMs: number): number {
  if (!value?.trim()) return fallbackMs;
  const match = value.trim().match(DURATION_RE);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallbackMs;
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * (multipliers[unit] ?? 0) || fallbackMs;
}

/** Valor para `JwtModule.signOptions.expiresIn` (ej. `24h`, `7d`). */
export function getAccessTokenExpires(): string {
  return process.env.JWT_ACCESS_EXPIRES?.trim() || "24h";
}

export function getRefreshTokenExpires(): string {
  return process.env.JWT_REFRESH_EXPIRES?.trim() || "30d";
}

export function getAccessCookieMaxAgeMs(): number {
  return parseDurationMs(getAccessTokenExpires(), 24 * 60 * 60 * 1000);
}

export function getRefreshCookieMaxAgeMs(): number {
  return parseDurationMs(getRefreshTokenExpires(), 30 * 24 * 60 * 60 * 1000);
}

export function getRefreshTokenDbExpiresAt(): Date {
  return new Date(Date.now() + getRefreshCookieMaxAgeMs());
}
