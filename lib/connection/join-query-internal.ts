import { existsSync } from "fs";
import { createRequire } from "module";
import { join } from "path";
import { pathToFileURL } from "url";
import type { NextRequest } from "next/server";

export type JoinQueryEtlResult = {
  ok: boolean;
  error?: string;
  rows?: unknown[];
  sourceExhausted?: boolean;
  nextSourceOffset?: number;
  materialized?: boolean;
};

function tryRegisterTsx(): void {
  const g = globalThis as { __biconicTsxRegistered?: boolean };
  if (g.__biconicTsxRegistered) return;
  try {
    const req = createRequire(__filename);
    req("tsx/cjs/api").register();
    g.__biconicTsxRegistered = true;
  } catch {
    // tsx no disponible (p. ej. imagen Docker mínima)
  }
}

function resolveJoinQueryRouteSpecifier(): string {
  const roots = new Set<string>([
    process.cwd(),
    join(process.cwd(), ".."),
    join(process.cwd(), "../.."),
  ]);
  try {
    const req = createRequire(__filename);
    roots.add(req.resolve("../../.."));
  } catch {
    /* ignore */
  }

  for (const root of roots) {
    const tsPath = join(root, "app/api/connection/join-query/route.ts");
    if (existsSync(tsPath)) return pathToFileURL(tsPath).href;
    const jsPath = join(root, "app/api/connection/join-query/route.js");
    if (existsSync(jsPath)) return jsPath;
  }
  return "@/app/api/connection/join-query/route";
}

async function loadJoinQueryPost(): Promise<
  (req: NextRequest) => Promise<Response>
> {
  tryRegisterTsx();
  const specifier = resolveJoinQueryRouteSpecifier();
  const errors: string[] = [];

  for (const spec of [specifier, "@/app/api/connection/join-query/route"]) {
    try {
      const mod = (await import(spec)) as {
        POST?: (req: NextRequest) => Promise<Response>;
      };
      if (typeof mod.POST === "function") return mod.POST;
      errors.push(`${spec}: POST no exportado`);
    } catch (e) {
      errors.push(
        `${spec}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  throw new Error(
    `No se pudo cargar join-query (${errors.slice(0, 2).join("; ")})`
  );
}

/**
 * Ejecuta join-query en el mismo proceso Node (requiere Next.js resoluble).
 * En el backend Nest suele fallar la carga del route; usar HTTP a Next vía callJoinQueryForEtl.
 */
export async function executeJoinQueryForEtlRun(
  body: Record<string, unknown>
): Promise<JoinQueryEtlResult> {
  const secret =
    process.env.INTERNAL_ETL_SECRET?.trim() ??
    process.env.CRON_SECRET?.trim() ??
    "";
  const POST = await loadJoinQueryPost();
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
