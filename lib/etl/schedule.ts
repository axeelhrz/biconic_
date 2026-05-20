import type { Json } from "@/lib/supabase/database.types";
import type { createServiceRoleClient } from "@/lib/supabase/service";

/** Frecuencias soportadas para actualización automática del ETL. */
export const ETL_SCHEDULE_FREQUENCIES = [
  { value: "15m", label: "15 minutos" },
  { value: "1h", label: "1 hora" },
  { value: "6h", label: "6 horas" },
  { value: "12h", label: "12 horas" },
  { value: "24h", label: "24 horas" },
  { value: "1w", label: "1 semana" },
  { value: "1M", label: "1 mes" },
] as const;

export type EtlScheduleFrequency = (typeof ETL_SCHEDULE_FREQUENCIES)[number]["value"];

export type EtlSchedule = {
  frequency?: string;
  lastRunAt?: string;
};

const FREQUENCY_MS: Record<string, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
};

export function getIntervalMs(frequency: string): number | null {
  const f = (frequency || "").trim();
  return FREQUENCY_MS[f] ?? null;
}

export function isDue(lastRunAt: string | null | undefined, intervalMs: number): boolean {
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt).getTime();
  if (Number.isNaN(last)) return true;
  return Date.now() - last >= intervalMs;
}

/** Próxima ejecución estimada (ISO) o null si manual / sin frecuencia válida. */
export function computeNextRunAt(
  lastRunAt: string | null | undefined,
  frequency: string | null | undefined
): Date | null {
  const f = (frequency || "").trim();
  if (!f) return null;
  const intervalMs = getIntervalMs(f);
  if (intervalMs == null) return null;
  const base = lastRunAt ? new Date(lastRunAt).getTime() : Date.now();
  if (Number.isNaN(base)) return new Date(Date.now() + intervalMs);
  return new Date(base + intervalMs);
}

export function formatScheduleLabel(frequency: string | null | undefined): string {
  const f = (frequency || "").trim();
  if (!f) return "Manual";
  return ETL_SCHEDULE_FREQUENCIES.find((x) => x.value === f)?.label ?? f;
}

/** Texto para UI de tarjetas (próxima ejecución). */
export function formatNextExecutionDisplay(
  lastRunAt: string | null | undefined,
  frequency: string | null | undefined,
  locale = "es-AR"
): string {
  const f = (frequency || "").trim();
  if (!f) return "Manual";
  const next = computeNextRunAt(lastRunAt, f);
  if (!next) return "—";
  try {
    return next.toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return next.toISOString();
  }
}

export function parseScheduleFromLayout(layout: unknown): EtlSchedule | undefined {
  if (!layout || typeof layout !== "object") return undefined;
  const guided = (layout as Record<string, unknown>).guided_config;
  if (!guided || typeof guided !== "object") return undefined;
  const schedule = (guided as Record<string, unknown>).schedule;
  if (!schedule || typeof schedule !== "object") return undefined;
  return schedule as EtlSchedule;
}

/** Minutos para considerar un run activo (evitar solapamiento con cron). */
export const ACTIVE_RUN_GUARD_MINUTES = 20;

/** Aplica frecuencia en guided_config.schedule; frequency vacío desactiva auto-actualización. */
export function mergeScheduleIntoGuidedConfig(
  guidedConfig: Record<string, unknown>,
  frequency: string | null | undefined,
  preserveLastRunAt?: string | null
): Record<string, unknown> {
  const existing = (guidedConfig.schedule as EtlSchedule | undefined) ?? {};
  const f = (frequency ?? "").trim();
  if (!f) {
    const { schedule: _removed, ...rest } = guidedConfig;
    return rest;
  }
  const lastRunAt = existing.lastRunAt ?? preserveLastRunAt ?? undefined;
  return {
    ...guidedConfig,
    schedule: {
      ...existing,
      frequency: f,
      ...(lastRunAt ? { lastRunAt } : {}),
    },
  };
}

/** Persiste lastRunAt tras una ejecución exitosa (service role client). */
export async function updateEtlScheduleLastRunAt(
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>,
  etlId: string,
  at?: string
): Promise<void> {
  const now = at ?? new Date().toISOString();
  const { data: etlRow } = await supabaseAdmin.from("etl").select("layout").eq("id", etlId).single();
  const currentLayout = (etlRow as { layout?: Record<string, unknown> } | null)?.layout ?? {};
  const guidedConfig = (currentLayout.guided_config as Record<string, unknown>) ?? {};
  const schedule = (guidedConfig.schedule as EtlSchedule | undefined) ?? {};
  if (!(schedule.frequency ?? "").trim()) return;

  const updatedLayout = {
    ...currentLayout,
    guided_config: {
      ...guidedConfig,
      schedule: { ...schedule, lastRunAt: now },
    },
  };
  await supabaseAdmin.from("etl").update({ layout: updatedLayout as Json }).eq("id", etlId);
}
