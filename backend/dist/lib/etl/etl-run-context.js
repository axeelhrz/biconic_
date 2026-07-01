"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEtlRunnerBase = getEtlRunnerBase;
exports.getEtlAppOrigin = getEtlAppOrigin;
exports.createEtlPipelineContext = createEtlPipelineContext;
const backend_config_1 = require("../api/backend-config");
function getEtlRunnerBase() {
    const explicit = process.env.PROCESS_EXCEL_RUNNER_URL?.trim().replace(/\/$/, "");
    if (explicit)
        return explicit;
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
    if (railwayDomain)
        return `https://${railwayDomain}/v1`;
    return (0, backend_config_1.getBackendApiUrl)();
}
function isLikelyBackendApiUrl(url) {
    const normalized = url.replace(/\/$/, "");
    const api = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") ??
        process.env.API_URL?.trim().replace(/\/$/, "") ??
        process.env.PROCESS_EXCEL_RUNNER_URL?.trim().replace(/\/$/, "");
    if (api && (normalized === api || normalized === api.replace(/\/v1$/, ""))) {
        return true;
    }
    if (/railway\.app\/v1$/i.test(normalized))
        return true;
    return false;
}
function getEtlAppOrigin() {
    const candidates = [
        process.env.NEXT_INTERNAL_URL?.trim().replace(/\/$/, ""),
        process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, ""),
        process.env.VERCEL_URL?.trim()
            ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`
            : null,
        process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
            ? (process.env.VERCEL_PROJECT_PRODUCTION_URL.startsWith("http")
                ? process.env.VERCEL_PROJECT_PRODUCTION_URL
                : `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
            : null,
    ].filter((u) => !!u && !isLikelyBackendApiUrl(u));
    if (candidates.length > 0)
        return candidates[0];
    return "http://localhost:3000";
}
function createEtlPipelineContext(partial) {
    return {
        appOrigin: getEtlAppOrigin(),
        etlRunnerBase: getEtlRunnerBase(),
        internalEtlSecret: process.env.INTERNAL_ETL_SECRET?.trim() ??
            process.env.CRON_SECRET?.trim() ??
            "",
        cookieHeader: null,
        ...partial,
    };
}
//# sourceMappingURL=etl-run-context.js.map