import { isOwnBackendEnabled } from "@/lib/api/backend-client";

const backendBase = () =>
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1").replace(
    /\/$/,
    ""
  );

const PROXY_ENDPOINTS = {
  aggregateData: "/api/dashboard/aggregate-data",
  distinctValues: "/api/dashboard/distinct-values",
  rawData: "/api/dashboard/raw-data",
  etlRun: "/api/etl/run",
  etlRunStatus: (runId: string) => `/api/etl/run-preview/status?runId=${runId}`,
  connections: "/api/connection/create",
  storageUploadUrl: "/api/upload-excel",
} as const;

/** Rutas de datos: en el navegador siempre proxy Next.js (cookies same-origin); en servidor, backend directo si USE_OWN_BACKEND. */
export function getDataEndpoints() {
  if (typeof window !== "undefined") {
    return PROXY_ENDPOINTS;
  }

  if (isOwnBackendEnabled()) {
    const base = backendBase();
    return {
      aggregateData: `${base}/dashboard/aggregate-data`,
      distinctValues: `${base}/dashboard/distinct-values`,
      rawData: `${base}/dashboard/raw-data`,
      etlRun: `${base}/etl/run`,
      etlRunStatus: (runId: string) => `${base}/etl/runs/${runId}`,
      connections: `${base}/connections`,
      storageUploadUrl: `${base}/storage/upload-url`,
    };
  }
  return PROXY_ENDPOINTS;
}

export async function postAggregateData(
  body: Record<string, unknown>,
  endpoint?: string
): Promise<unknown> {
  const url = endpoint ?? getDataEndpoints().aggregateData;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string" ? data.error : `Error ${res.status}`
    );
  }
  return data;
}
