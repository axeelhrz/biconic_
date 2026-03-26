import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const FREQUENCY_MS: Record<string, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
};

function getIntervalMs(frequency: string): number | null {
  const f = (frequency || "").trim();
  return FREQUENCY_MS[f] ?? null;
}

function isDue(lastRunAt: string | null | undefined, intervalMs: number): boolean {
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt).getTime();
  if (Number.isNaN(last)) return true;
  return Date.now() - last >= intervalMs;
}

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

async function runScheduled() {

  const supabase = createServiceRoleClient();
  const { data: rows, error } = await supabase.from("etl").select("id, layout");

  if (error) {
    console.error("[run-scheduled] Error fetching ETLs:", error);
    throw new Error(error.message);
  }

  const now = new Date().toISOString();
  const due: { id: string; layout: Record<string, unknown>; guidedConfig: Record<string, unknown> }[] = [];

  for (const row of rows || []) {
    const layout = (row as { layout?: Record<string, unknown> }).layout as Record<string, unknown> | undefined;
    const guidedConfig = layout?.guided_config as Record<string, unknown> | undefined;
    const schedule = guidedConfig?.schedule as { frequency?: string; lastRunAt?: string } | undefined;
    const frequency = schedule?.frequency?.trim();
    if (!frequency) continue;

    const intervalMs = getIntervalMs(frequency);
    if (intervalMs == null) continue;

    if (!isDue(schedule?.lastRunAt, intervalMs)) continue;

    due.push({
      id: (row as { id: string }).id,
      layout: layout ?? {},
      guidedConfig: guidedConfig ?? {},
    });
  }

  const baseUrl =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const runUrl = `${baseUrl}/api/etl/run`;
  const cronSecret = process.env.ETL_SCHEDULER_SECRET || process.env.CRON_SECRET;
  let triggered = 0;

  for (const { id, layout, guidedConfig } of due) {
    let sanitizedJoin = guidedConfig.join as Record<string, unknown> | undefined;
    if (sanitizedJoin && typeof sanitizedJoin === "object" && Array.isArray(sanitizedJoin.joins)) {
      const validJoins = (sanitizedJoin.joins as Record<string, unknown>[]).filter(
        (jn) => !!jn && typeof jn === "object" && jn.secondaryConnectionId != null && String(jn.secondaryConnectionId).trim() !== ""
      );
      if (validJoins.length === 0) {
        sanitizedJoin = undefined;
      } else {
        sanitizedJoin = { ...sanitizedJoin, joins: validJoins };
      }
    }
    const body = {
      etlId: id,
      connectionId: guidedConfig.connectionId,
      filter: guidedConfig.filter,
      union: guidedConfig.union,
      ...(sanitizedJoin ? { join: sanitizedJoin } : {}),
      clean: guidedConfig.clean,
      end: guidedConfig.end,
      schedule: guidedConfig.schedule,
      waitForCompletion: false,
    };

    try {
      const res = await fetch(runUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": cronSecret!,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[run-scheduled] ETL ${id} run failed: ${res.status} ${text}`);
        continue;
      }
      triggered++;

      const schedule = (guidedConfig.schedule as Record<string, unknown>) ?? {};
      const updatedLayout = {
        ...layout,
        guided_config: {
          ...guidedConfig,
          schedule: { ...schedule, lastRunAt: now },
        },
      };

      await supabase.from("etl").update({ layout: updatedLayout }).eq("id", id);
    } catch (err) {
      console.error(`[run-scheduled] ETL ${id} fetch/update error:`, err);
    }
  }

  return { ok: true, due: due.length, triggered };
}

/**
 * POST /api/etl/run-scheduled
 * Ejecuta los ETL que tienen programación y están "due" según su frecuencia.
 * Requiere header x-cron-secret, Authorization: Bearer <secret>, o query secret=ETL_SCHEDULER_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = getSecret(req);
  if (!isAuthorized(secret)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  try {
    const result = await runScheduled();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en run-scheduled";
    console.error("[run-scheduled]", message, err);
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
    const result = await runScheduled();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en run-scheduled";
    console.error("[run-scheduled]", message, err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
