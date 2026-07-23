/**
 * Valida que los filtros activos aporten el nivel temporal exigido
 * por una comparación temporal (año / mes / día / …) antes de ejecutarla.
 */

import type { CompareSpec, CompareTemporalMode } from "@/lib/dashboard/compareSpec";
import type { DateGranularity } from "@/lib/dashboard/dateFormatting";
import { parseIsoYearMonthForLabel } from "@/lib/dashboard/dateFormatting";

export type TemporalCompareFilterLevel = "year" | "month" | "day" | "week" | "quarter" | "semester";

export type AppliedTemporalFilterLevels = {
  hasYear: boolean;
  hasMonth: boolean;
  hasDay: boolean;
  hasYearMonth: boolean;
  hasQuarter: boolean;
  hasSemester: boolean;
  hasFy: boolean;
  hasBetween: boolean;
};

export type TemporalCompareFilterValidation = {
  ok: boolean;
  required: TemporalCompareFilterLevel | null;
  missing: TemporalCompareFilterLevel[];
  reason?: string;
};

type FilterLike = {
  field?: string;
  operator?: string;
  value?: unknown;
};

const FY_FIELD_RE = /^(fy|fiscal_?year|ano_?fiscal|año_?fiscal|ejercicio)$/i;

function hasFilterValue(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    const o = value as { from?: unknown; to?: unknown };
    return String(o.from ?? "").trim() !== "" || String(o.to ?? "").trim() !== "";
  }
  return true;
}

function isYearLike(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0 && value.every(isYearLike);
  const s = String(value).trim();
  if (!/^\d{4}$/.test(s)) return false;
  const n = Number(s);
  return Number.isFinite(n) && n >= 1900 && n <= 2100;
}

function collectNumbers(value: unknown): number[] {
  if (value == null || value === "") return [];
  const parts = Array.isArray(value) ? value : [value];
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (Number.isFinite(n)) out.push(Math.round(n));
  }
  return out;
}

function hasYearMonthValues(value: unknown): boolean {
  if (value == null || value === "") return false;
  const parts = Array.isArray(value) ? value : [value];
  for (const p of parts) {
    if (parseIsoYearMonthForLabel(p)) return true;
    const s = String(p ?? "").trim();
    if (/^\d{4}-\d{1,2}/.test(s)) return true;
  }
  return false;
}

function isFyField(field: string): boolean {
  return FY_FIELD_RE.test(String(field ?? "").trim().toLowerCase().replace(/\s+/g, ""));
}

/** Niveles temporales presentes en los filtros activos (con valor). */
export function detectAppliedTemporalFilterLevels(
  filters: readonly FilterLike[]
): AppliedTemporalFilterLevels {
  const out: AppliedTemporalFilterLevels = {
    hasYear: false,
    hasMonth: false,
    hasDay: false,
    hasYearMonth: false,
    hasQuarter: false,
    hasSemester: false,
    hasFy: false,
    hasBetween: false,
  };

  for (const f of filters) {
    const field = String(f.field ?? "").trim();
    if (!field || !hasFilterValue(f.value)) continue;
    const op = String(f.operator ?? "").toUpperCase().trim();

    if (isFyField(field) && (op === "=" || op === "IN" || op === "EQ")) {
      out.hasFy = true;
      out.hasYear = true;
    }

    if (op === "YEAR") {
      out.hasYear = true;
    }

    if ((op === "=" || op === "EQ" || op === "IN") && isYearLike(f.value)) {
      out.hasYear = true;
    }

    if (op === "YEAR_MONTH") {
      if (hasYearMonthValues(f.value)) {
        out.hasYearMonth = true;
        out.hasYear = true;
        out.hasMonth = true;
      }
    }

    if (op === "MONTH") {
      if (hasYearMonthValues(f.value)) {
        out.hasYearMonth = true;
        out.hasYear = true;
        out.hasMonth = true;
      } else {
        const months = collectNumbers(f.value).filter((m) => m >= 1 && m <= 12);
        if (months.length > 0) out.hasMonth = true;
      }
    }

    if (op === "DAY") {
      const days = collectNumbers(f.value).filter((d) => d >= 1 && d <= 31);
      if (days.length > 0) out.hasDay = true;
      // Fecha completa ISO en DAY / = 
      const parts = Array.isArray(f.value) ? f.value : [f.value];
      for (const p of parts) {
        if (/^\d{4}-\d{2}-\d{2}/.test(String(p ?? "").trim())) {
          out.hasDay = true;
          out.hasMonth = true;
          out.hasYear = true;
        }
      }
    }

    if (op === "QUARTER") {
      const qs = collectNumbers(f.value).filter((q) => q >= 1 && q <= 4);
      if (qs.length > 0) out.hasQuarter = true;
    }

    if (op === "SEMESTER") {
      const ss = collectNumbers(f.value).filter((s) => s === 1 || s === 2);
      if (ss.length > 0) out.hasSemester = true;
    }

    if (op === "BETWEEN") {
      let from: unknown;
      let to: unknown;
      const v = f.value;
      if (Array.isArray(v) && v.length >= 2) [from, to] = v;
      else if (v && typeof v === "object") {
        from = (v as { from?: unknown }).from;
        to = (v as { to?: unknown }).to;
      }
      const fs = String(from ?? "").trim();
      const ts = String(to ?? "").trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(fs) && /^\d{4}-\d{2}-\d{2}/.test(ts)) {
        out.hasBetween = true;
        out.hasYear = true;
        out.hasMonth = true;
        out.hasDay = true;
      } else if (/^\d{4}-\d{2}/.test(fs) && /^\d{4}-\d{2}/.test(ts)) {
        out.hasBetween = true;
        out.hasYear = true;
        out.hasMonth = true;
      } else if (/^\d{4}$/.test(fs) && /^\d{4}$/.test(ts)) {
        out.hasBetween = true;
        out.hasYear = true;
      }
    }
  }

  return out;
}

function granularityToRequiredLevel(granularity: DateGranularity): TemporalCompareFilterLevel {
  switch (granularity) {
    case "year":
      return "year";
    case "quarter":
      return "quarter";
    case "semester":
      return "semester";
    case "month":
      return "month";
    case "week":
      return "week";
    case "day":
      return "day";
    default:
      return "month";
  }
}

function modeToRequiredLevel(mode: CompareTemporalMode): TemporalCompareFilterLevel | null {
  switch (mode) {
    case "calendar_prev_year":
      return "year";
    case "calendar_prev_month":
      return "month";
    case "calendar_prev_week":
      return "week";
    case "calendar_prev_day":
      return "day";
    case "prev_bucket":
    case "same_period_prior_year":
      return null; // usar granularity
    default:
      return null;
  }
}

/**
 * Nivel temporal mínimo exigido por la comparación, o null si no aplica.
 */
export function requiredTemporalLevelForCompare(compareSpec: CompareSpec): TemporalCompareFilterLevel | null {
  if (compareSpec.kind === "temporal") {
    const fromMode = modeToRequiredLevel(compareSpec.mode);
    if (fromMode) return fromMode;
    return granularityToRequiredLevel(compareSpec.granularity);
  }
  if (compareSpec.kind === "cumulative") {
    return granularityToRequiredLevel(compareSpec.granularity);
  }
  return null;
}

function levelSatisfied(
  required: TemporalCompareFilterLevel,
  applied: AppliedTemporalFilterLevels
): boolean {
  switch (required) {
    case "year":
      return applied.hasYear || applied.hasFy || applied.hasYearMonth || applied.hasBetween;
    case "month":
      return (
        applied.hasYearMonth ||
        applied.hasBetween ||
        ((applied.hasYear || applied.hasFy) && applied.hasMonth)
      );
    case "day":
      return (
        applied.hasBetween ||
        ((applied.hasYear || applied.hasFy || applied.hasYearMonth) &&
          (applied.hasMonth || applied.hasYearMonth) &&
          applied.hasDay)
      );
    case "week":
      // Semana: rango de fechas o día concreto (YEAR+MONTH+DAY).
      return (
        applied.hasBetween ||
        ((applied.hasYear || applied.hasFy || applied.hasYearMonth) &&
          (applied.hasMonth || applied.hasYearMonth) &&
          applied.hasDay)
      );
    case "quarter":
      return (
        applied.hasBetween ||
        ((applied.hasYear || applied.hasFy) && applied.hasQuarter)
      );
    case "semester":
      return (
        applied.hasBetween ||
        ((applied.hasYear || applied.hasFy) && applied.hasSemester)
      );
    default:
      return false;
  }
}

function missingForLevel(
  required: TemporalCompareFilterLevel,
  applied: AppliedTemporalFilterLevels
): TemporalCompareFilterLevel[] {
  if (levelSatisfied(required, applied)) return [];
  const missing: TemporalCompareFilterLevel[] = [];
  switch (required) {
    case "year":
      if (!(applied.hasYear || applied.hasFy || applied.hasYearMonth || applied.hasBetween)) {
        missing.push("year");
      }
      break;
    case "month":
      if (!(applied.hasYear || applied.hasFy || applied.hasYearMonth || applied.hasBetween)) {
        missing.push("year");
      }
      if (!(applied.hasMonth || applied.hasYearMonth || applied.hasBetween)) {
        missing.push("month");
      }
      break;
    case "day":
    case "week":
      if (!(applied.hasYear || applied.hasFy || applied.hasYearMonth || applied.hasBetween)) {
        missing.push("year");
      }
      if (!(applied.hasMonth || applied.hasYearMonth || applied.hasBetween)) {
        missing.push("month");
      }
      if (!(applied.hasDay || applied.hasBetween)) {
        missing.push(required === "week" ? "week" : "day");
      }
      break;
    case "quarter":
      if (!(applied.hasYear || applied.hasFy || applied.hasBetween)) missing.push("year");
      if (!(applied.hasQuarter || applied.hasBetween)) missing.push("quarter");
      break;
    case "semester":
      if (!(applied.hasYear || applied.hasFy || applied.hasBetween)) missing.push("year");
      if (!(applied.hasSemester || applied.hasBetween)) missing.push("semester");
      break;
  }
  return missing;
}

const LEVEL_LABEL: Record<TemporalCompareFilterLevel, string> = {
  year: "año",
  month: "mes",
  day: "día",
  week: "semana (año, mes y día o un rango de fechas)",
  quarter: "trimestre",
  semester: "semestre",
};

function reasonForRequired(required: TemporalCompareFilterLevel, missing: TemporalCompareFilterLevel[]): string {
  if (required === "year") {
    return "Para comparar por año, seleccioná un filtro de año.";
  }
  if (required === "month") {
    return "Para comparar por mes, seleccioná filtros de año y mes.";
  }
  if (required === "day") {
    return "Para comparar por día, seleccioná filtros de año, mes y día.";
  }
  if (required === "week") {
    return "Para comparar por semana, seleccioná un rango de fechas o filtros de año, mes y día.";
  }
  if (required === "quarter") {
    return "Para comparar por trimestre, seleccioná filtros de año y trimestre.";
  }
  if (required === "semester") {
    return "Para comparar por semestre, seleccioná filtros de año y semestre.";
  }
  const labels = missing.map((m) => LEVEL_LABEL[m]).join(", ");
  return `Falta el nivel temporal necesario (${labels}).`;
}

/**
 * Valida filtros activos contra el nivel exigido por la comparación temporal/acumulada.
 * Si la comparación no es temporal, `ok: true` y `required: null`.
 */
export function validateTemporalCompareAgainstFilters(
  compareSpec: CompareSpec,
  filters: readonly FilterLike[]
): TemporalCompareFilterValidation {
  const required = requiredTemporalLevelForCompare(compareSpec);
  if (!required) {
    return { ok: true, required: null, missing: [] };
  }

  const applied = detectAppliedTemporalFilterLevels(filters);
  const missing = missingForLevel(required, applied);
  if (missing.length === 0) {
    return { ok: true, required, missing: [] };
  }

  return {
    ok: false,
    required,
    missing,
    reason: reasonForRequired(required, missing),
  };
}
