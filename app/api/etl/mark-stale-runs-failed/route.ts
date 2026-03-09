import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

/** Minutos desde started_at para considerar un run "stale" (por encima de maxDuration 300s de Vercel). El cron en vercel.json invoca este endpoint cada 10 min. */
const STALE_MINUTES = 10;

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
    .select("id, status, started_at, etl_id")
    .in("status", ["started", "running"])
    .lt("started_at", threshold);

  if (fetchErr) {
    console.error("[mark-stale-runs-failed] Error fetching runs:", fetchErr);
    throw new Error(fetchErr.message);
  }

  if (!staleRows?.length) {
    return { ok: true, marked: 0, message: "No hay runs obsoletos." };
  }

  const ids = staleRows.map((r) => (r as { id: string }).id);
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
