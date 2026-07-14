import type { EtlPipelineContext } from "@/lib/etl/etl-run-context";
import type { JoinQueryEtlResult } from "@/lib/connection/join-query-internal";

const JOIN_FETCH_TIMEOUT_MS =
  Number(process.env.ETL_JOIN_TIMEOUT_MS) > 0
    ? Number(process.env.ETL_JOIN_TIMEOUT_MS) + 60_000
    : 650_000;

function joinFetchSignal(): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(JOIN_FETCH_TIMEOUT_MS);
  }
  return undefined;
}

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

function isNextJsRuntime(): boolean {
  return !!(process.env.NEXT_RUNTIME || process.env.VERCEL);
}

function isModuleLoadError(message: string): boolean {
  return /Cannot find module|next\/server|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|No se pudo cargar join-query/i.test(
    message
  );
}

function formatFetchError(url: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET/i.test(msg)) {
    return `${url}: no se pudo conectar (${msg}). ¿Está corriendo Next.js en esa URL?`;
  }
  return `${url}: ${msg}`;
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

async function tryJoinQueryInProcess(
  body: Record<string, unknown>,
  errors: string[]
): Promise<JoinQueryEtlResult | null> {
  try {
    const { executeJoinQueryForEtlRun } = await import(
      "@/lib/connection/join-query-internal"
    );
    const direct = await executeJoinQueryForEtlRun(body);
    if (direct.ok) return direct;
    throw new Error(direct.error || "JOIN múltiple falló");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isModuleLoadError(msg)) {
      errors.push(`in-process: ${msg}`);
      return null;
    }
    throw e instanceof Error ? e : new Error(msg);
  }
}

async function tryJoinQueryHttp(
  body: Record<string, unknown>,
  ctx: EtlPipelineContext,
  errors: string[]
): Promise<JoinQueryEtlResult | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(ctx.cookieHeader ? { Cookie: ctx.cookieHeader } : {}),
    ...(ctx.internalEtlSecret ? { "x-internal-etl": ctx.internalEtlSecret } : {}),
  };

  const origins = resolveJoinQueryOrigins(ctx);
  if (origins.length === 0) {
    errors.push("http: sin orígenes Next configurados (NEXT_INTERNAL_URL)");
    return null;
  }

  let lastBusinessError: string | null = null;

  for (const origin of origins) {
    const url = `${origin}/api/connection/join-query`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: joinFetchSignal(),
      });
      const data = await parseJoinResponse(res);
      if (data.ok) return data;
      lastBusinessError = data.error || `estado ${res.status}`;
      errors.push(`${url}: ${lastBusinessError}`);
      if (res.status !== 404 && res.status !== 405 && res.status !== 503) {
        throw new Error(lastBusinessError);
      }
    } catch (e) {
      if (
        e instanceof Error &&
        lastBusinessError &&
        e.message === lastBusinessError
      ) {
        throw e;
      }
      errors.push(formatFetchError(url, e));
    }
  }

  return null;
}

/**
 * Ejecuta JOIN múltiple para el pipeline ETL.
 * En Nest/Railway: HTTP a Next (Vercel o `npm run dev` local en :3000).
 * En Vercel: in-process primero.
 */
export async function callJoinQueryForEtl(
  joinQueryBody: Record<string, unknown>,
  ctx: EtlPipelineContext
): Promise<JoinQueryEtlResult> {
  const body = { ...joinQueryBody, fromEtlRun: true };
  const errors: string[] = [];

  const strategies: Array<
    () => Promise<JoinQueryEtlResult | null>
  > = isNextJsRuntime()
    ? [
        () => tryJoinQueryInProcess(body, errors),
        () => tryJoinQueryHttp(body, ctx, errors),
      ]
    : [
        () => tryJoinQueryHttp(body, ctx, errors),
        () => tryJoinQueryInProcess(body, errors),
      ];

  for (const strategy of strategies) {
    const result = await strategy();
    if (result) return result;
  }

  const localHint = isNextJsRuntime()
    ? ""
    : " En local, ejecutá Next en :3000 (`npm run dev`) y definí NEXT_INTERNAL_URL=http://localhost:3000.";
  const prodHint =
    " En Railway, configurá NEXT_INTERNAL_URL con la URL de Vercel.";

  throw new Error(
    `Error ejecutando JOIN múltiple: ${errors[errors.length - 1] || "sin respuesta"}.${localHint}${prodHint} Intentos: ${errors.slice(0, 5).join(" | ")}`
  );
}
