"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDurationMs = parseDurationMs;
exports.getAccessTokenExpires = getAccessTokenExpires;
exports.getRefreshTokenExpires = getRefreshTokenExpires;
exports.getAccessCookieMaxAgeMs = getAccessCookieMaxAgeMs;
exports.getRefreshCookieMaxAgeMs = getRefreshCookieMaxAgeMs;
exports.getRefreshTokenDbExpiresAt = getRefreshTokenDbExpiresAt;
const DURATION_RE = /^(\d+)(s|m|h|d)$/i;
function parseDurationMs(value, fallbackMs) {
    if (!value?.trim())
        return fallbackMs;
    const match = value.trim().match(DURATION_RE);
    if (!match)
        return fallbackMs;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0)
        return fallbackMs;
    const unit = match[2].toLowerCase();
    const multipliers = {
        s: 1_000,
        m: 60_000,
        h: 3_600_000,
        d: 86_400_000,
    };
    return amount * (multipliers[unit] ?? 0) || fallbackMs;
}
function getAccessTokenExpires() {
    return process.env.JWT_ACCESS_EXPIRES?.trim() || "24h";
}
function getRefreshTokenExpires() {
    return process.env.JWT_REFRESH_EXPIRES?.trim() || "30d";
}
function getAccessCookieMaxAgeMs() {
    return parseDurationMs(getAccessTokenExpires(), 24 * 60 * 60 * 1000);
}
function getRefreshCookieMaxAgeMs() {
    return parseDurationMs(getRefreshTokenExpires(), 30 * 24 * 60 * 60 * 1000);
}
function getRefreshTokenDbExpiresAt() {
    return new Date(Date.now() + getRefreshCookieMaxAgeMs());
}
//# sourceMappingURL=session-config.js.map