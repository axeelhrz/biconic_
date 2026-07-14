import type { NextRequest } from "next/server";

export type JoinQueryEtlResult = {
  ok: boolean;
  error?: string;
  rows?: unknown[];
  sourceExhausted?: boolean;
  nextSourceOffset?: number;
  materialized?: boolean;
};

/**
 * Ejecuta join-query en el mismo proceso (runtime Next.js / Vercel).
 * En Nest/Railway usar callJoinQueryForEtl, que llama por HTTP a Next.
 */
export async function executeJoinQueryForEtlRun(
  body: Record<string, unknown>
): Promise<JoinQueryEtlResult> {
  const secret =
    process.env.INTERNAL_ETL_SECRET?.trim() ??
    process.env.CRON_SECRET?.trim() ??
    "";
  const { POST } = await import("@/app/api/connection/join-query/route");
  const req = {
    json: async () => ({ ...body, fromEtlRun: true }),
    headers: new Headers({
      "Content-Type": "application/json",
      ...(secret ? { "x-internal-etl": secret } : {}),
    }),
  } as unknown as NextRequest;

  const res = await POST(req);
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {
      ok: false,
      error: (text || "").slice(0, 300) || `estado ${res.status}`,
    };
  }
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: String(data.error || `estado ${res.status}`),
    };
  }
  return {
    ok: true,
    rows: data.rows as unknown[] | undefined,
    sourceExhausted: data.sourceExhausted as boolean | undefined,
    nextSourceOffset: data.nextSourceOffset as number | undefined,
    materialized: data.materialized as boolean | undefined,
  };
}
