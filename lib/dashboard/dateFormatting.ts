export type DateGranularity = "day" | "week" | "month" | "quarter" | "semester" | "year";

/** Orden día/mes en cadenas ambiguas tipo `4/1/2024` (DMY = 4 ene, MDY = 1 abr). */
export type DateSlashOrder = "DMY" | "MDY";

export type ParseDateLikeOptions = {
  slashDateOrder?: DateSlashOrder;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function safeDateFromParts(year: number, month1: number, day: number): Date | null {
  if (!Number.isFinite(year) || !Number.isFinite(month1) || !Number.isFinite(day)) return null;
  if (month1 < 1 || month1 > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month1 - 1, day));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month1 - 1 || dt.getUTCDate() !== day) return null;
  return dt;
}

/** Deriva orden slash desde el formato de columna del ETL (p. ej. MM/DD/YYYY). */
export function dateSlashOrderFromColumnFormat(format?: string | null): DateSlashOrder {
  return String(format ?? "").trim() === "MM/DD/YYYY" ? "MDY" : "DMY";
}

/** Resuelve orden slash para una columna concreta en `columnDisplay`. */
export function dateSlashOrderForNamedColumn(
  columnDisplay: Record<string, { format?: string }> | undefined,
  columnName: string | undefined
): DateSlashOrder {
  if (!columnName?.trim() || !columnDisplay) return "DMY";
  const t = columnName.trim();
  const direct = columnDisplay[t];
  if (direct) return dateSlashOrderFromColumnFormat(direct.format);
  const found = Object.entries(columnDisplay).find(([k]) => k.toLowerCase() === t.toLowerCase());
  return dateSlashOrderFromColumnFormat(found?.[1]?.format);
}

/**
 * Parsea `d/m/y` con barras: si un token es >12, el orden queda fijado; si ambos ≤12, usa `slashDateOrder` (por defecto DMY).
 */
function parseAmbiguousSlashDate(a: number, b: number, year: number, order: DateSlashOrder): Date | null {
  if (a > 12) {
    return safeDateFromParts(year, b, a);
  }
  if (b > 12) {
    return safeDateFromParts(year, a, b);
  }
  if (order === "MDY") {
    return safeDateFromParts(year, a, b);
  }
  return safeDateFromParts(year, b, a);
}

export function parseDateLike(value: unknown, options?: ParseDateLikeOptions): Date | null {
  const slashOrder: DateSlashOrder = options?.slashDateOrder === "MDY" ? "MDY" : "DMY";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const dt = new Date(value > 1e12 ? value : value * 1000);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  // MM/yyyy (mes inequívoco)
  const my = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (my) {
    const month = Number(my[1]);
    const year = Number(my[2]);
    return safeDateFromParts(year, month, 1);
  }

  // yyyy-MM (periodo mes; inequívoco frente a dd/MM vs MM/dd)
  const ym = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (ym) {
    const year = Number(ym[1]);
    const month = Number(ym[2]);
    return safeDateFromParts(year, month, 1);
  }

  // d/m/y o m/d/y con año de 4 dígitos
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3]);
    return parseAmbiguousSlashDate(a, b, year, slashOrder);
  }

  // yyyy-MM-dd with optional time
  const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  if (isoLike) {
    const year = Number(isoLike[1]);
    const month = Number(isoLike[2]);
    const day = Number(isoLike[3]);
    return safeDateFromParts(year, month, day);
  }

  // yy-MM-dd with optional time (fallback for legacy/bad payloads)
  const shortYear = raw.match(/^(\d{2})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  if (shortYear) {
    const yy = Number(shortYear[1]);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    const month = Number(shortYear[2]);
    const day = Number(shortYear[3]);
    return safeDateFromParts(year, month, day);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateByGranularity(
  value: unknown,
  granularity: DateGranularity,
  fallback?: string,
  parseOpts?: ParseDateLikeOptions
): string | null {
  const dt = parseDateLike(value, parseOpts);
  if (!dt) return fallback ?? null;

  const year = dt.getUTCFullYear();
  const month = dt.getUTCMonth() + 1;
  const day = dt.getUTCDate();

  if (granularity === "year") return String(year);
  if (granularity === "month") return `${year}-${pad2(month)}`;
  if (granularity === "quarter") return `T${Math.floor((month - 1) / 3) + 1}/${year}`;
  if (granularity === "semester") return `S${month <= 6 ? 1 : 2}/${year}`;
  // day and week: show canonical calendar date
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

/** Mismo criterio que el preview del wizard de análisis (`formatPreviewDateValue`). */
export type AnalysisDateDisplayFormat = "short" | "monthYear" | "year" | "datetime";

const MONTH_NAMES_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Extrae año y mes desde `YYYY-MM` o prefijo `YYYY-MM-DD` / ISO (`…T…`), sin `Date`.
 * Así las etiquetas "Mes año" no dependen de zonas horarias ni de `new Date(string)` ambiguos.
 */
export function parseIsoYearMonthForLabel(value: unknown): { year: number; month: number } | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:[Tt ].*)?$/.exec(raw);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  if (m[3] != null) {
    const day = Number(m[3]);
    if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  }
  return { year, month };
}

/**
 * `d/m/y` ambiguo (ambos tokens ≤12): en agregación mensual suele guardarse el **día 1** del mes.
 * Elige DMY o MDY según cuál interpretación cae en el día 1 UTC; si ambas o ninguna, usa `parseOpts`.
 */
export function resolveMonthYearFromAmbiguousSlash(
  raw: string,
  parseOpts?: ParseDateLikeOptions
): { year: number; month: number } | null {
  const t = raw.trim();
  const slash = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!slash) return null;
  const a = Number(slash[1]);
  const b = Number(slash[2]);
  const y = Number(slash[3]);
  if (![a, b, y].every((n) => Number.isFinite(n))) return null;
  if (a > 12 || b > 12) return null;
  const dmy = parseDateLike(t, { slashDateOrder: "DMY" });
  const mdy = parseDateLike(t, { slashDateOrder: "MDY" });
  if (!dmy || !mdy) return null;
  const dmyFirst = dmy.getUTCDate() === 1;
  const mdyFirst = mdy.getUTCDate() === 1;
  if (dmyFirst && !mdyFirst) {
    return { year: dmy.getUTCFullYear(), month: dmy.getUTCMonth() + 1 };
  }
  if (mdyFirst && !dmyFirst) {
    return { year: mdy.getUTCFullYear(), month: mdy.getUTCMonth() + 1 };
  }
  const preferred = parseDateLike(t, parseOpts);
  if (!preferred) return null;
  return { year: preferred.getUTCFullYear(), month: preferred.getUTCMonth() + 1 };
}

/**
 * Formatea valores de eje / etiqueta temporal según el formato de visualización elegido en el análisis.
 * Si `displayFormat` es undefined, usa `formatDateByGranularity`.
 */
export function formatAnalysisDateForChart(
  value: unknown,
  granularity: DateGranularity,
  displayFormat: AnalysisDateDisplayFormat | undefined,
  fallback?: string,
  parseOpts?: ParseDateLikeOptions
): string | null {
  if (displayFormat == null) {
    return formatDateByGranularity(value, granularity, fallback, parseOpts);
  }
  if (displayFormat === "monthYear") {
    const ymp = parseIsoYearMonthForLabel(value);
    if (ymp) return `${MONTH_NAMES_SHORT[ymp.month - 1] ?? ""} ${ymp.year}`.trim();
    if (typeof value === "string") {
      const slashYmp = resolveMonthYearFromAmbiguousSlash(value, parseOpts);
      if (slashYmp) return `${MONTH_NAMES_SHORT[slashYmp.month - 1] ?? ""} ${slashYmp.year}`.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const ms = value > 1e12 ? value : value * 1000;
      const nd = new Date(ms);
      if (!Number.isNaN(nd.getTime())) {
        return `${MONTH_NAMES_SHORT[nd.getUTCMonth()] ?? ""} ${nd.getUTCFullYear()}`.trim();
      }
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${MONTH_NAMES_SHORT[value.getUTCMonth()] ?? ""} ${value.getUTCFullYear()}`.trim();
    }
  }
  const dt = parseDateLike(value, parseOpts);
  if (!dt) return fallback ?? null;

  const year = dt.getUTCFullYear();
  const month = dt.getUTCMonth() + 1;
  const day = dt.getUTCDate();

  if (displayFormat === "year") return String(year);
  if (displayFormat === "monthYear") return `${MONTH_NAMES_SHORT[month - 1] ?? ""} ${year}`.trim();
  if (displayFormat === "datetime") {
    return `${pad2(day)}/${pad2(month)}/${year} ${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}`;
  }
  if (displayFormat === "short") {
    return `${pad2(day)}/${pad2(month)}/${year}`;
  }
  return formatDateByGranularity(value, granularity, fallback, parseOpts);
}
