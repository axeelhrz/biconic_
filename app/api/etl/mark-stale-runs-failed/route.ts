import { NextRequest, NextResponse } from "next/server";
import { shouldUseOwnBackend, proxyToBackend } from "@/lib/api/backend-proxy";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getStaleRunMinutes } from "@/lib/etl/schedule";
import { isEtlRunProgressMessage } from "@/lib/etl/run-progress";

/** Minutos desde started_at para considerar un run "stale". Override: ETL_STALE_RUN_MINUTES */
const STALE_MINUTES = getStaleRunMinutes();

function getSecret(req: NextRequest): string | null {
  return (
    req.headers.get("x-cron-secret") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim() ||
    (req.nextUrl?.searchParams?.get("secret") ?? null)
  );
}

function isAuthorized(secret: string | null): boolean {
  const expected = process.env.ETL_SCHEDULER_SECRET || process.env.CRON_SECRET;
  return !!expected && secret === expected;
}

/**
 * Marca runs de ETL que llevan demasiado tiempo en "started" o "running" como fallidos.
 * Evita que queden colgados "En progreso" cuando la función serverless es terminada por timeout (p. ej. 5 min en Vercel).
 * Pensado para ser invocado por un cron (Vercel Cron o externo) con x-cron-secret.
 */
async function markStaleRunsFailed() {
  const supabase = createServiceRoleClient();
  const threshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

  const { data: staleRows, error: fetchErr } = await supabase
    .from("etl_runs_log")
    .select("id, status, started_at, etl_id, rows_processed, error_message")
    .in("status", ["started", "running"])
    .lt("started_at", threshold);

  if (fetchErr) {
    console.error("[mark-stale-runs-failed] Error fetching runs:", fetchErr);
    throw new Error(fetchErr.message);
  }

  type StaleRunRow = {
    id: string;
    rows_processed?: number | null;
    error_message?: string | null;
  };

  const ids = ((staleRows || []) as StaleRunRow[])
    .filter((row) => {
      const rowsProcessed = Number(row.rows_processed ?? 0);
      if (rowsProcessed > 0) return false;
      if (isEtlRunProgressMessage(row.error_message)) return false;
      return true;
    })
    .map((row) => row.id);

  if (!ids.length) {
    return { ok: true, marked: 0, message: "No hay runs obsoletos." };
  }
  const { error: updateErr } = await supabase
    .from("etl_runs_log")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: "Ejecución interrumpida o timeout (límite de plataforma). Revise el volumen de datos o ejecute de nuevo.",
    })
    .in("id", ids)
    .in("status", ["started", "running"]);

  if (updateErr) {
    console.error("[mark-stale-runs-failed] Error updating runs:", updateErr);
    throw new Error(updateErr.message);
  }

  console.log(`[mark-stale-runs-failed] Marcados ${ids.length} runs como fallidos:`, ids);
  return { ok: true, marked: ids.length, ids };
}

export async function POST(req: NextRequest) {
  if (shouldUseOwnBackend()) {
    return proxyToBackend(req, "/etl/mark-stale-runs-failed");
  }
  const secret = getSecret(req);
  if (!isAuthorized(secret)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  try {
    const result = await markStaleRunsFailed();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en mark-stale-runs-failed";
    console.error("[mark-stale-runs-failed]", message, err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** GET para cron (Vercel Cron suele usar GET). */
export async function GET(req: NextRequest) {
  if (shouldUseOwnBackend()) {
    return proxyToBackend(req, "/etl/mark-stale-runs-failed", { method: "POST" });
  }
  const secret = getSecret(req);
  if (!isAuthorized(secret)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  try {
    const result = await markStaleRunsFailed();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en mark-stale-runs-failed";
    console.error("[mark-stale-runs-failed]", message, err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
