import postgres, { type JSONValue } from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import {
  ETL_SCHEDULE_FREQUENCIES,
  formatNextExecutionDisplay,
  formatScheduleLabel,
  type EtlSchedule,
} from "@/lib/etl/schedule";

export { ETL_SCHEDULE_FREQUENCIES, formatNextExecutionDisplay, formatScheduleLabel };
export type ConnectionSchedule = EtlSchedule;

export function parseScheduleFromConnectionConfig(config: unknown): ConnectionSchedule | undefined {
  if (!config || typeof config !== "object" || Array.isArray(config)) return undefined;
  const schedule = (config as Record<string, unknown>).schedule;
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) return undefined;
  return schedule as ConnectionSchedule;
}

/** Aplica frecuencia en config.schedule; frequency vacío desactiva auto-actualización. */
export function mergeScheduleIntoConnectionConfig(
  config: Record<string, unknown> | null | undefined,
  frequency: string | null | undefined,
  preserveLastRunAt?: string | null
): Record<string, unknown> {
  const base = { ...(config ?? {}) };
  const existing = (base.schedule as ConnectionSchedule | undefined) ?? {};
  const f = (frequency ?? "").trim();
  if (!f) {
    const { schedule: _removed, ...rest } = base;
    return rest;
  }
  const lastRunAt = existing.lastRunAt ?? preserveLastRunAt ?? undefined;
  return {
    ...base,
    schedule: {
      ...existing,
      frequency: f,
      ...(lastRunAt ? { lastRunAt } : {}),
    },
  };
}

export async function updateConnectionScheduleLastRunAt(
  connectionId: string,
  at?: string
): Promise<void> {
  const now = at ?? new Date().toISOString();
  const sql = postgres(getInternalDbUrl(), { max: 2 });
  try {
    const [row] = await sql<{ config: Record<string, unknown> | null }[]>`
      SELECT config FROM public.connections WHERE id = ${connectionId} LIMIT 1
    `;
    if (!row) return;
    const config = (row.config && typeof row.config === "object" ? row.config : {}) as Record<
      string,
      unknown
    >;
    const schedule = (config.schedule as ConnectionSchedule | undefined) ?? {};
    if (!(schedule.frequency ?? "").trim()) return;
    const updatedConfig = {
      ...config,
      schedule: { ...schedule, lastRunAt: now },
    };
    await sql`
      UPDATE public.connections
      SET config = ${sql.json(updatedConfig as JSONValue)}, updated_at = now()
      WHERE id = ${connectionId}
    `;
  } finally {
    await sql.end();
  }
}
