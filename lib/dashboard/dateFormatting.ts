export type DateGranularity = "day" | "week" | "month" | "quarter" | "semester" | "year";

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

export function parseDateLike(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const dt = new Date(value > 1e12 ? value : value * 1000);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  // dd/MM/yyyy
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    return safeDateFromParts(year, month, day);
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
  fallback?: string
): string | null {
  const dt = parseDateLike(value);
  if (!dt) return fallback ?? null;

  const year = dt.getUTCFullYear();
  const month = dt.getUTCMonth() + 1;
  const day = dt.getUTCDate();

  if (granularity === "year") return String(year);
  if (granularity === "month") return `${pad2(month)}/${year}`;
  if (granularity === "quarter") return `T${Math.floor((month - 1) / 3) + 1}/${year}`;
  if (granularity === "semester") return `S${month <= 6 ? 1 : 2}/${year}`;
  // day and week: show canonical calendar date
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

