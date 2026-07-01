import type { EtlPipelineContext } from "@/lib/etl/etl-run-context";
import type { JoinQueryEtlResult } from "@/lib/connection/join-query-internal";

function isBackendApiUrl(url: string): boolean {
  const normalized = url.replace(/\/$/, "");
  const candidates = [
    process.env.NEXT_PUBLIC_API_URL,
    process.env.API_URL,
    process.env.PROCESS_EXCEL_RUNNER_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/v1`
      : null,
  ]
    .filter(Boolean)
    .map((u) => String(u).replace(/\/$/, ""));
  return candidates.some(
    (c) => normalized === c || normalized === c.replace(/\/v1$/, "")
  );
}

/** Orígenes válidos de Next.js (no el API Nest en Railway). */
export function resolveJoinQueryOrigins(ctx: EtlPipelineContext): string[] {
  const origins: string[] = [];
  const add = (raw?: string | null) => {
    const url = raw?.trim().replace(/\/$/, "");
    if (!url || isBackendApiUrl(url)) return;
    if (!origins.includes(url)) origins.push(url);
  };
  add(ctx.appOrigin);
  add(process.env.NEXT_INTERNAL_URL);
  add(process.env.NEXT_PUBLIC_SITE_URL);
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) add(vercel.startsWith("http") ? vercel : `https://${vercel}`);
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) {
    add(vercelProd.startsWith("http") ? vercelProd : `https://${vercelProd}`);
  }
  add("http://127.0.0.1:3000");
  add("http://localhost:3000");
  return origins;
}

async function parseJoinResponse(
  res: Response
): Promise<JoinQueryEtlResult> {
  const text = await res.text();
  try {
    const data = text ? (JSON.parse(text) as JoinQueryEtlResult) : { ok: false };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: String(data.error || `estado ${res.status}`),
      };
    }
    return data;
  } catch {
    return {
      ok: false,
      error: (text || "").slice(0, 300) || `estado ${res.status}`,
    };
  }
}

/**
 * Ejecuta JOIN múltiple para el pipeline ETL sin depender de una sola URL.
 * Orden: in-process (Next) → Nest interno → HTTP a Next (Vercel/local).
 */
export async function callJoinQueryForEtl(
  joinQueryBody: Record<string, unknown>,
  ctx: EtlPipelineContext
): Promise<JoinQueryEtlResult> {
  const body = { ...joinQueryBody, fromEtlRun: true };
  const errors: string[] = [];

  try {
    const { executeJoinQueryForEtlRun } = await import(
      "@/lib/connection/join-query-internal"
    );
    const direct = await executeJoinQueryForEtlRun(body);
    if (direct.ok) return direct;
    errors.push(`in-process: ${direct.error}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Cannot find module|next\/server|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/i.test(msg)) {
      errors.push(`in-process: ${msg}`);
    }
  }

  const runnerBase = ctx.etlRunnerBase.replace(/\/$/, "");
  const internalNestUrl = `${runnerBase}/internal/connection/join-query`;
  try {
    const res = await fetch(internalNestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ctx.internalEtlSecret
          ? { "x-internal-etl": ctx.internalEtlSecret }
          : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await parseJoinResponse(res);
    if (data.ok) return data;
    errors.push(`nestjs (${internalNestUrl}): ${data.error}`);
  } catch (e) {
    errors.push(
      `nestjs (${internalNestUrl}): ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(ctx.cookieHeader ? { Cookie: ctx.cookieHeader } : {}),
    ...(ctx.internalEtlSecret ? { "x-internal-etl": ctx.internalEtlSecret } : {}),
  };

  for (const origin of resolveJoinQueryOrigins(ctx)) {
    const url = `${origin}/api/connection/join-query`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await parseJoinResponse(res);
      if (data.ok) return data;
      errors.push(`${url}: ${data.error}`);
      if (res.status !== 404 && res.status !== 405 && res.status !== 503) break;
    } catch (e) {
      errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const hint =
    "En Railway configurá NEXT_INTERNAL_URL con la URL de Vercel. En local, ejecutá Next en :3000 y definí NEXT_INTERNAL_URL=http://localhost:3000.";
  throw new Error(
    `Error ejecutando JOIN múltiple: ${errors[errors.length - 1] || "sin respuesta"}. ${hint} Intentos: ${errors.slice(0, 4).join(" | ")}`
  );
}
