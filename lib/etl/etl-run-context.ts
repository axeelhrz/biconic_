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

export function getEtlAppOrigin(): string {
  return (
    process.env.NEXT_INTERNAL_URL?.trim().replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ??
    "http://localhost:3000"
  );
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
