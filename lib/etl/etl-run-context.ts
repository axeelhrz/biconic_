import { getBackendApiUrl } from "@/lib/api/backend-config";

export type EtlPipelineContext = {
  /** Origen Next.js (join-query y rutas legacy en Vercel). */
  appOrigin: string;
  /** API Nest (continuaciones del pipeline en Railway). */
  etlRunnerBase: string;
  internalEtlSecret?: string;
  cookieHeader?: string | null;
};

export function getEtlRunnerBase(): string {
  const explicit = process.env.PROCESS_EXCEL_RUNNER_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) return `https://${railwayDomain}/v1`;
  return getBackendApiUrl();
}

function isLikelyBackendApiUrl(url: string): boolean {
  const normalized = url.replace(/\/$/, "");
  const api =
    process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") ??
    process.env.API_URL?.trim().replace(/\/$/, "") ??
    process.env.PROCESS_EXCEL_RUNNER_URL?.trim().replace(/\/$/, "");
  if (api && (normalized === api || normalized === api.replace(/\/v1$/, ""))) {
    return true;
  }
  if (/railway\.app\/v1$/i.test(normalized)) return true;
  return false;
}

export function getEtlAppOrigin(): string {
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
  ].filter((u): u is string => !!u && !isLikelyBackendApiUrl(u));

  if (candidates.length > 0) return candidates[0];
  return "http://localhost:3000";
}

export function createEtlPipelineContext(
  partial?: Partial<EtlPipelineContext>
): EtlPipelineContext {
  return {
    appOrigin: getEtlAppOrigin(),
    etlRunnerBase: getEtlRunnerBase(),
    internalEtlSecret:
      process.env.INTERNAL_ETL_SECRET?.trim() ??
      process.env.CRON_SECRET?.trim() ??
      "",
    cookieHeader: null,
    ...partial,
  };
}
