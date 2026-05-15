import type { CompareSpec, CompareTemporalMode } from "@/lib/dashboard/compareSpec";
import { getComparePeriodSource, type ComparePeriodSource } from "@/lib/dashboard/compareSpec";
import { parseIsoYearMonthForLabel } from "@/lib/dashboard/dateFormatting";

export type AggregationFilterLike = {
  field?: string;
  operator?: string;
  value?: unknown;
  [key: string]: unknown;
};

function normFieldKey(field: string | undefined): string {
  return String(field ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function fieldsMatch(a: string | undefined, b: string | undefined): boolean {
  return normFieldKey(a) === normFieldKey(b);
}

/** Desplaza año-mes calendario (mes 1–12). */
export function shiftCalendarYearMonth(year: number, month1: number, deltaMonths: number): { year: number; month1: number } {
  const idx = year * 12 + (month1 - 1) + deltaMonths;
  return { year: Math.floor(idx / 12), month1: (idx % 12) + 1 };
}

function ymKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function collectYearMonthsFromUnknown(value: unknown): { year: number; month1: number }[] {
  if (value === "" || value == null) return [];
  const parts = Array.isArray(value) ? value : [value];
  const out: { year: number; month1: number }[] = [];
  for (const p of parts) {
    const iso = parseIsoYearMonthForLabel(p);
    if (iso) {
      out.push({ year: iso.year, month1: iso.month });
      continue;
    }
    const s = String(p ?? "").trim();
    const mIso = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?(?:[Tt ].*)?$/.exec(s);
    if (mIso) {
      const y = Number(mIso[1]);
      const mo = Number(mIso[2]);
      if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12) out.push({ year: y, month1: mo });
    }
  }
  return out;
}

function modeNeedsPriorCalendarBucket(mode: CompareTemporalMode): boolean {
  return (
    mode === "prev_bucket" ||
    mode === "calendar_prev_month" ||
    mode === "calendar_prev_week" ||
    mode === "calendar_prev_day"
  );
}

function modeNeedsPriorYearSameBucket(mode: CompareTemporalMode): boolean {
  return mode === "same_period_prior_year" || mode === "calendar_prev_year";
}

/**
 * Incluye en los filtros los buckets de fecha necesarios para que `applyCompareSpecToRows`
 * encuentre filas de referencia (p. ej. marzo + febrero para MoM con filtro solo marzo).
 * Conservador: solo toca filtros del mismo campo físico que `compareField` y patrones reconocidos.
 */
export function expandAggregationFiltersForTemporalCompare(
  filters: readonly AggregationFilterLike[],
  options: {
    compareField: string;
    compareSpec: CompareSpec;
    /** Si no se pasa, se toma de `compareSpec` / default dashboard. */
    periodSource?: ComparePeriodSource;
    aggComparePeriodSource?: ComparePeriodSource | string | null;
  }
): AggregationFilterLike[] {
  const { compareField, compareSpec } = options;
  const periodSource = options.periodSource ?? getComparePeriodSource(compareSpec, options.aggComparePeriodSource);

  if (periodSource === "fixed" || periodSource === "data_max") {
    return filters.map((f) => ({ ...f }));
  }

  if (compareSpec.kind !== "temporal") {
    return filters.map((f) => ({ ...f }));
  }

  const mode = compareSpec.mode;
  const gran = compareSpec.granularity;

  const wantPrev = modeNeedsPriorCalendarBucket(mode);
  const wantYoy = modeNeedsPriorYearSameBucket(mode);
  if (!wantPrev && !wantYoy) {
    return filters.map((f) => ({ ...f }));
  }

  /** Expansión mensual inequívoca; otros granularities requieren más reglas. */
  if (gran !== "month") {
    return filters.map((f) => ({ ...f }));
  }

  return filters.map((f) => {
    const field = String(f.field ?? "").trim();
    if (!field || !fieldsMatch(field, compareField)) return { ...f };

    const op = String(f.operator ?? "").toUpperCase().trim();

    if (op === "MONTH" || op === "YEAR_MONTH") {
      const yms = collectYearMonthsFromUnknown(f.value);
      if (yms.length === 0) return { ...f };
      const keys = new Set<string>();
      for (const { year, month1 } of yms) {
        keys.add(ymKey(year, month1));
        if (wantPrev) {
          const p = shiftCalendarYearMonth(year, month1, -1);
          keys.add(ymKey(p.year, p.month1));
        }
        if (wantYoy) {
          keys.add(ymKey(year - 1, month1));
        }
      }
      const merged = [...keys].sort();
      return { ...f, value: merged.length === 1 ? merged[0]! : merged };
    }

    if (op === "YEAR" && wantYoy) {
      const raw = f.value;
      const nums: number[] = [];
      const parts = Array.isArray(raw) ? raw : [raw];
      for (const p of parts) {
        const n = Number(p);
        if (Number.isFinite(n) && n >= 1900 && n <= 2100) nums.push(Math.round(n));
      }
      if (nums.length === 0) return { ...f };
      const set = new Set(nums);
      for (const y of nums) set.add(y - 1);
      const merged = [...set].sort((a, b) => a - b);
      return { ...f, value: merged.length === 1 ? merged[0] : merged };
    }

    if (op === "BETWEEN" && wantPrev) {
      let from: unknown;
      let to: unknown;
      const v = f.value;
      if (Array.isArray(v) && v.length >= 2) {
        [from, to] = v;
      } else if (v && typeof v === "object") {
        from = (v as { from?: unknown }).from;
        to = (v as { to?: unknown }).to;
      } else {
        return { ...f };
      }
      const fs = String(from ?? "").trim();
      const ts = String(to ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fs) || !/^\d{4}-\d{2}-\d{2}$/.test(ts)) return { ...f };
      const d0 = new Date(`${fs}T00:00:00Z`);
      d0.setUTCMonth(d0.getUTCMonth() - 1);
      const pad = (n: number) => String(n).padStart(2, "0");
      const newFrom = `${d0.getUTCFullYear()}-${pad(d0.getUTCMonth() + 1)}-${pad(d0.getUTCDate())}`;
      if (newFrom === fs) return { ...f };
      return { ...f, value: Array.isArray(v) ? [newFrom, ts] : { ...(v as object), from: newFrom, to: ts } };
    }

    return { ...f };
  });
}
