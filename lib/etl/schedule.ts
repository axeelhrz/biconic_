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
  /** HH:mm en hora Argentina (ART), para programación diaria/semanal. */
  runAtTime?: string;
  /** 0=domingo … 6=sábado; solo con frequency=weekly. */
  runOnWeekdays?: number[];
};

export const CALENDAR_SCHEDULE_FREQUENCIES = [
  { value: "daily", label: "Todos los días (hora fija)" },
  { value: "weekly", label: "Días específicos (hora fija)" },
] as const;

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lunes", short: "Lun" },
  { value: 2, label: "Martes", short: "Mar" },
  { value: 3, label: "Miércoles", short: "Mié" },
  { value: 4, label: "Jueves", short: "Jue" },
  { value: 5, label: "Viernes", short: "Vie" },
  { value: 6, label: "Sábado", short: "Sáb" },
  { value: 0, label: "Domingo", short: "Dom" },
] as const;

export type ScheduleInput = {
  frequency?: string | null;
  runAtTime?: string | null;
  runOnWeekdays?: number[] | null;
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

export function isCalendarSchedule(schedule: EtlSchedule | null | undefined): boolean {
  const f = schedule?.frequency?.trim();
  return f === "daily" || f === "weekly";
}

export function parseRunAtTime(time: string | null | undefined): { hour: number; minute: number } | null {
  if (!time?.trim()) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function normalizeRunAtTime(time: string | null | undefined): string | null {
  const parsed = parseRunAtTime(time);
  if (!parsed) return null;
  return `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;
}

export function normalizeWeekdays(days: number[] | null | undefined): number[] {
  if (!Array.isArray(days)) return [];
  const set = new Set<number>();
  for (const d of days) {
    if (Number.isInteger(d) && d >= 0 && d <= 6) set.add(d);
  }
  return [...set].sort((a, b) => {
    const order = (x: number) => (x === 0 ? 7 : x);
    return order(a) - order(b);
  });
}

/** Zona horaria de negocio para mostrar horarios de programación (Argentina). */
export const SCHEDULE_DISPLAY_TIMEZONE = "America/Argentina/Buenos_Aires";

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
};

const WEEKDAY_SHORT_TO_NUM: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getZonedDateParts(date: Date, timeZone = SCHEDULE_DISPLAY_TIMEZONE): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hourRaw = Number(get("hour"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: WEEKDAY_SHORT_TO_NUM[get("weekday")] ?? 0,
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: Number(get("minute")),
  };
}

export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = SCHEDULE_DISPLAY_TIMEZONE
): Date {
  const targetMs = Date.UTC(year, month - 1, day, hour, minute);
  let utc = targetMs;
  for (let i = 0; i < 5; i++) {
    const parts = getZonedDateParts(new Date(utc), timeZone);
    const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const diff = targetMs - zonedAsUtc;
    if (diff === 0) break;
    utc += diff;
  }
  return new Date(utc);
}

function sameCalendarDay(a: ZonedParts, b: ZonedParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function isCalendarScheduleDue(
  schedule: EtlSchedule,
  now: Date = new Date(),
  timeZone = SCHEDULE_DISPLAY_TIMEZONE
): boolean {
  const f = schedule.frequency?.trim();
  if (f !== "daily" && f !== "weekly") return false;
  const runTime = parseRunAtTime(schedule.runAtTime);
  if (!runTime) return false;

  const nowParts = getZonedDateParts(now, timeZone);
  if (f === "weekly") {
    const days = normalizeWeekdays(schedule.runOnWeekdays);
    if (days.length === 0) return false;
    if (!days.includes(nowParts.weekday)) return false;
  }

  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  const runMinutes = runTime.hour * 60 + runTime.minute;
  if (nowMinutes < runMinutes) return false;

  if (schedule.lastRunAt) {
    const lastParts = getZonedDateParts(new Date(schedule.lastRunAt), timeZone);
    if (sameCalendarDay(lastParts, nowParts)) return false;
  }

  return true;
}

export function isScheduleDue(schedule: EtlSchedule | null | undefined, now: Date = new Date()): boolean {
  const f = schedule?.frequency?.trim();
  if (!f) return false;
  if (isCalendarSchedule(schedule)) return isCalendarScheduleDue(schedule!, now);
  const intervalMs = getIntervalMs(f);
  if (intervalMs == null) return false;
  return isDue(schedule?.lastRunAt, intervalMs);
}

export function computeNextCalendarRunAt(
  schedule: EtlSchedule,
  from: Date = new Date(),
  timeZone = SCHEDULE_DISPLAY_TIMEZONE
): Date | null {
  const f = schedule.frequency?.trim();
  if (f !== "daily" && f !== "weekly") return null;
  const runTime = parseRunAtTime(schedule.runAtTime);
  if (!runTime) return null;
  const weekdays =
    f === "weekly" ? normalizeWeekdays(schedule.runOnWeekdays) : [0, 1, 2, 3, 4, 5, 6];
  if (weekdays.length === 0) return null;

  const fromParts = getZonedDateParts(from, timeZone);
  const fromDayUtc = zonedTimeToUtc(fromParts.year, fromParts.month, fromParts.day, 0, 0, timeZone);

  for (let offset = 0; offset <= 370; offset++) {
    const dayBase = new Date(fromDayUtc.getTime() + offset * 86_400_000);
    const dayParts = getZonedDateParts(dayBase, timeZone);
    if (!weekdays.includes(dayParts.weekday)) continue;

    const candidate = zonedTimeToUtc(
      dayParts.year,
      dayParts.month,
      dayParts.day,
      runTime.hour,
      runTime.minute,
      timeZone
    );
    if (candidate.getTime() > from.getTime()) return candidate;
  }
  return null;
}

export function normalizeScheduleInput(input: ScheduleInput): EtlSchedule | null {
  const f = (input.frequency ?? "").trim();
  if (!f) return null;

  if (f === "daily" || f === "weekly") {
    const runAtTime = normalizeRunAtTime(input.runAtTime);
    if (!runAtTime) return null;
    if (f === "weekly") {
      const runOnWeekdays = normalizeWeekdays(input.runOnWeekdays);
      if (runOnWeekdays.length === 0) return null;
      return { frequency: f, runAtTime, runOnWeekdays };
    }
    return { frequency: f, runAtTime };
  }

  if (getIntervalMs(f) == null) return null;
  return { frequency: f };
}

export function validateScheduleInput(input: ScheduleInput): string | null {
  const f = (input.frequency ?? "").trim();
  if (!f) return null;
  if (f === "daily" || f === "weekly") {
    if (!normalizeRunAtTime(input.runAtTime)) {
      return "Indicá una hora válida (HH:mm) para la programación.";
    }
    if (f === "weekly" && normalizeWeekdays(input.runOnWeekdays).length === 0) {
      return "Seleccioná al menos un día de la semana.";
    }
    return null;
  }
  if (getIntervalMs(f) == null) return "Frecuencia no válida.";
  return null;
}

/** Próxima ejecución estimada (ISO) o null si manual / sin frecuencia válida. */
export function computeNextRunAt(
  lastRunAt: string | null | undefined,
  frequency: string | null | undefined,
  schedule?: EtlSchedule | null
): Date | null {
  const full: EtlSchedule = schedule ?? { frequency: frequency ?? undefined, lastRunAt: lastRunAt ?? undefined };
  const f = (full.frequency ?? frequency ?? "").trim();
  if (!f) return null;

  if (isCalendarSchedule(full)) {
    const base = lastRunAt ? new Date(lastRunAt) : new Date();
    const from = Number.isNaN(base.getTime()) ? new Date() : base;
    return computeNextCalendarRunAt(full, from);
  }

  const intervalMs = getIntervalMs(f);
  if (intervalMs == null) return null;
  const base = lastRunAt ? new Date(lastRunAt).getTime() : Date.now();
  if (Number.isNaN(base)) return new Date(Date.now() + intervalMs);
  return new Date(base + intervalMs);
}

export function formatCalendarScheduleLabel(schedule: EtlSchedule): string {
  const runAtTime = normalizeRunAtTime(schedule.runAtTime) ?? "??:??";
  const f = schedule.frequency?.trim();
  if (f === "daily") return `Todos los días a las ${runAtTime}`;
  if (f === "weekly") {
    const days = normalizeWeekdays(schedule.runOnWeekdays);
    const labels = days
      .map((d) => WEEKDAY_OPTIONS.find((w) => w.value === d)?.short ?? String(d))
      .join(", ");
    return labels ? `${labels} a las ${runAtTime}` : `Semanal a las ${runAtTime}`;
  }
  return f ?? "Manual";
}

export function formatScheduleLabel(
  frequency: string | null | undefined,
  schedule?: EtlSchedule | null
): string {
  const full: EtlSchedule = schedule ?? { frequency: frequency ?? undefined };
  const f = (full.frequency ?? frequency ?? "").trim();
  if (!f) return "Manual";
  if (isCalendarSchedule(full)) return formatCalendarScheduleLabel(full);
  return ETL_SCHEDULE_FREQUENCIES.find((x) => x.value === f)?.label ?? f;
}

export function formatScheduleDateTime(
  date: Date | string,
  locale = "es-AR",
  timeZone = SCHEDULE_DISPLAY_TIMEZONE
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleString(locale, {
      timeZone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

/** Texto para UI de tarjetas (próxima ejecución) — siempre en hora Argentina. */
export function formatNextExecutionDisplay(
  lastRunAt: string | null | undefined,
  frequency: string | null | undefined,
  localeOrSchedule: string | EtlSchedule | null = "es-AR",
  maybeSchedule?: EtlSchedule | null
): string {
  const locale = typeof localeOrSchedule === "string" ? localeOrSchedule : "es-AR";
  const schedule: EtlSchedule | null =
    maybeSchedule ??
    (typeof localeOrSchedule === "object" && localeOrSchedule !== null ? localeOrSchedule : null);
  const f = (schedule?.frequency ?? frequency ?? "").trim();
  if (!f) return "Manual";
  const next = computeNextRunAt(lastRunAt, f, schedule ?? { frequency: f, lastRunAt: lastRunAt ?? undefined });
  if (!next) return "—";
  return formatScheduleDateTime(next, locale);
}

export function parseScheduleRequestBody(body: unknown): ScheduleInput {
  if (!body || typeof body !== "object") return { frequency: null };
  const b = body as Record<string, unknown>;
  const frequency =
    b.frequency === null || b.frequency === undefined ? null : String(b.frequency).trim();
  const runAtTime =
    b.runAtTime === null || b.runAtTime === undefined ? null : String(b.runAtTime).trim();
  const runOnWeekdays = Array.isArray(b.runOnWeekdays)
    ? b.runOnWeekdays.map((d) => Number(d)).filter((d) => Number.isInteger(d))
    : null;
  return { frequency, runAtTime, runOnWeekdays };
}

export function buildScheduleApiPayload(schedule: EtlSchedule): {
  frequency: string | null;
  lastRunAt: string | null;
  label: string;
  nextExecution: string;
  runAtTime: string | null;
  runOnWeekdays: number[] | null;
} {
  const frequency = schedule.frequency?.trim() || null;
  return {
    frequency,
    lastRunAt: schedule.lastRunAt ?? null,
    label: formatScheduleLabel(frequency, schedule),
    nextExecution: formatNextExecutionDisplay(schedule.lastRunAt, frequency, schedule),
    runAtTime: schedule.runAtTime ?? null,
    runOnWeekdays: schedule.runOnWeekdays ?? null,
  };
}

export function parseScheduleFromLayout(layout: unknown): EtlSchedule | undefined {
  if (!layout || typeof layout !== "object") return undefined;
  const guided = (layout as Record<string, unknown>).guided_config;
  if (!guided || typeof guided !== "object") return undefined;
  const schedule = (guided as Record<string, unknown>).schedule;
  if (!schedule || typeof schedule !== "object") return undefined;
  return schedule as EtlSchedule;
}

/** Minutos para considerar un run activo (evitar solapamiento con cron). Override: ETL_ACTIVE_RUN_GUARD_MINUTES */
function resolveActiveRunGuardMinutes(): number {
  const raw = Number(process.env.ETL_ACTIVE_RUN_GUARD_MINUTES);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 240;
}

export const ACTIVE_RUN_GUARD_MINUTES = resolveActiveRunGuardMinutes();

/** Minutos sin progreso para cerrar runs colgados al iniciar otro run del mismo ETL. Override: ETL_STALE_RUN_MINUTES */
export function getStaleRunMinutes(): number {
  const raw = Number(process.env.ETL_STALE_RUN_MINUTES);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 240;
}

/** Tope duro: runs activos más allá de esto se cierran aunque reporten progreso (zombie). */
export function getHardStaleRunMinutes(): number {
  const raw = Number(process.env.ETL_HARD_STALE_RUN_MINUTES);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 480;
}

/** Aplica programación en guided_config.schedule; frequency vacío desactiva auto-actualización. */
export function mergeScheduleIntoGuidedConfig(
  guidedConfig: Record<string, unknown>,
  input: ScheduleInput | string | null | undefined,
  preserveLastRunAt?: string | null
): Record<string, unknown> {
  const scheduleInput: ScheduleInput =
    typeof input === "string" || input === null || input === undefined
      ? { frequency: input }
      : input;
  const normalized = normalizeScheduleInput(scheduleInput);
  if (!normalized) {
    const { schedule: _removed, ...rest } = guidedConfig;
    return rest;
  }
  const existing = (guidedConfig.schedule as EtlSchedule | undefined) ?? {};
  const lastRunAt = existing.lastRunAt ?? preserveLastRunAt ?? undefined;
  return {
    ...guidedConfig,
    schedule: {
      ...normalized,
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
