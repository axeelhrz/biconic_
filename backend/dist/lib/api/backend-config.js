"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldUseOwnBackend = shouldUseOwnBackend;
exports.getBackendApiUrl = getBackendApiUrl;
exports.getPublicBackendApiUrl = getPublicBackendApiUrl;
function shouldUseOwnBackend() {
    return true;
}
function getBackendApiUrl() {
    const explicit = process.env.NEXT_PUBLIC_API_URL?.trim() ??
        process.env.API_URL?.trim() ??
        process.env.PROCESS_EXCEL_RUNNER_URL?.trim();
    if (explicit)
        return explicit.replace(/\/$/, "");
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
    if (railwayDomain)
        return `https://${railwayDomain}/v1`;
    return "http://localhost:4000/v1";
}
function getPublicBackendApiUrl() {
    if (typeof window !== "undefined") {
        return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1").replace(/\/$/, "");
    }
    return getBackendApiUrl();
}
//# sourceMappingURL=backend-config.js.map