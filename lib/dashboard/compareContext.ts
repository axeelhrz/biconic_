import type { CompareSpec, CompareTemporalMode } from "@/lib/dashboard/compareSpec";
import { normalizeAggregationCompare, type LegacyCompareInput } from "@/lib/dashboard/compareSpec";
import { legacyCompareInputFromWidgetAgg } from "@/lib/dashboard/compareDisplayKeys";
import type { DashboardCompareUi } from "@/lib/dashboard/compareDisplayKeys";
import { shiftCalendarYearMonth } from "@/lib/dashboard/expandAggregationFiltersForCompare";
import { parseIsoYearMonthForLabel } from "@/lib/dashboard/dateFormatting";

export type CompareContextFilter = {
  id?: string;
  field?: string;
  operator?: string;
  value?: unknown;
  [key: string]: unknown;
};

export type DashboardCompareDefaults = {
  enabled: boolean;
  compare: CompareSpec;
  label?: string;
  showDelta?: boolean;
  showDeltaPct?: boolean;
  showCardHeaderStrip?: boolean;
};

export type TemporalAnchor =
  | { kind: "fy"; field: string; values: string[] }
  | { kind: "year_month"; field: string; yearMonths: string[] }
  | { kind: "year"; field: string; years: number[] }
  | { kind: "month_only"; field: string; months: number[]; yearField?: string; years?: number[] }
  | { kind: "quarter"; field: string; quarters: number[]; years?: number[] }
  | { kind: "semester"; field: string; semesters: number[]; years?: number[] }
  | { kind: "between"; field: string; from: string; to: string };

export type DashboardCompareContexts = {
  currentFilters: CompareContextFilter[];
  comparativeFilters: CompareContextFilter[];
  comparable: boolean;
  unavailableReason?: string;
  compareLabel?: string;
  usesDualQuery: boolean;
};

const FY_FIELD_RE = /^(fy|fiscal_?year|ano_?fiscal|año_?fiscal|ejercicio)$/i;

function normFieldKey(field: string | undefined): string {
  return String(field ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function fieldsMatch(a: string | undefined, b: string | undefined): boolean {
  return normFieldKey(a) === normFieldKey(b);
}

/** Año calendario 1900–2100 (misma regla que aggregate-data). */
export function isYearLikeValue(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0 && value.every(isYearLikeValue);
  const s = String(value).trim();
  if (!/^\d{4}$/.test(s)) return false;
  const n = Number(s);
  return Number.isFinite(n) && n >= 1900 && n <= 2100;
}

function isFyField(field: string): boolean {
  return FY_FIELD_RE.test(normFieldKey(field));
}

/** Desplaza etiqueta FY: FY26 → FY25, FY2026 → FY2025. */
export function shiftFyLabel(raw: unknown, deltaYears = -1): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = /^(FY\s*)(\d{2,4})$/i.exec(s.replace(/\s+/g, ""));
  if (!m) return null;
  const prefix = m[1]!;
  const num = Number(m[2]);
  if (!Number.isFinite(num)) return null;
  const width = m[2]!.length;
  const next = num + deltaYears;
  if (next < 0) return null;
  const padded = width === 2 ? String(next).padStart(2, "0") : String(next);
  return `${prefix}${padded}`;
}

function collectStringValues(value: unknown): string[] {
  if (value == null || value === "") return [];
  const parts = Array.isArray(value) ? value : [value];
  return parts.map((p) => String(p ?? "").trim()).filter(Boolean);
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

function collectYearMonths(value: unknown): string[] {
  if (value == null || value === "") return [];
  const parts = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const p of parts) {
    const iso = parseIsoYearMonthForLabel(p);
    if (iso) {
      out.push(`${iso.year}-${String(iso.month).padStart(2, "0")}`);
      continue;
    }
    const s = String(p ?? "").trim();
    const m = /^(\d{4})-(\d{1,2})/.exec(s);
    if (m) out.push(`${m[1]}-${String(Number(m[2])).padStart(2, "0")}`);
  }
  return out;
}

function modeNeedsPriorYear(mode: CompareTemporalMode): boolean {
  return mode === "same_period_prior_year" || mode === "calendar_prev_year";
}

function modeNeedsPrevBucket(mode: CompareTemporalMode): boolean {
  return (
    mode === "prev_bucket" ||
    mode === "calendar_prev_month" ||
    mode === "calendar_prev_week" ||
    mode === "calendar_prev_day"
  );
}

/** Detecta ancla temporal en filtros activos (FY, YEAR, MONTH, YEAR_MONTH, QUARTER, SEMESTER, BETWEEN, = año). */
export function extractTemporalAnchor(filters: readonly CompareContextFilter[]): TemporalAnchor | null {
  let fyAnchor: TemporalAnchor | null = null;
  let yearMonthAnchor: { field: string; yearMonths: string[] } | null = null;
  let yearAnchor: { field: string; years: number[] } | null = null;
  let monthOnlyAnchor: { field: string; months: number[] } | null = null;
  let quarterAnchor: { field: string; quarters: number[] } | null = null;
  let semesterAnchor: { field: string; semesters: number[] } | null = null;
  let betweenAnchor: TemporalAnchor | null = null;

  for (const f of filters) {
    const field = String(f.field ?? "").trim();
    if (!field) continue;
    const op = String(f.operator ?? "").toUpperCase().trim();

    if (isFyField(field) && (op === "=" || op === "IN" || op === "EQ")) {
      const vals = collectStringValues(f.value);
      if (vals.length > 0) fyAnchor = { kind: "fy", field, values: vals };
    }

    if (op === "YEAR_MONTH" || op === "MONTH") {
      const yms = collectYearMonths(f.value);
      if (yms.length > 0) {
        yearMonthAnchor = { field, yearMonths: yms };
        continue;
      }
      if (op === "MONTH") {
        const months = collectNumbers(f.value).filter((m) => m >= 1 && m <= 12);
        if (months.length > 0) monthOnlyAnchor = { field, months };
      }
    }

    if (op === "YEAR") {
      const years = collectNumbers(f.value).filter((y) => y >= 1900 && y <= 2100);
      if (years.length > 0) yearAnchor = { field, years };
    }

    if ((op === "=" || op === "EQ") && isYearLikeValue(f.value)) {
      const y = Number(String(f.value).trim());
      if (!yearAnchor || fieldsMatch(yearAnchor.field, field)) {
        yearAnchor = { field, years: [y] };
      }
    }

    if (op === "IN" && isYearLikeValue(f.value)) {
      const years = collectNumbers(f.value).filter((y) => y >= 1900 && y <= 2100);
      if (years.length > 0) yearAnchor = { field, years };
    }

    if (op === "QUARTER") {
      const quarters = collectNumbers(f.value).filter((q) => q >= 1 && q <= 4);
      if (quarters.length > 0) quarterAnchor = { field, quarters };
    }

    if (op === "SEMESTER") {
      const semesters = collectNumbers(f.value).filter((s) => s === 1 || s === 2);
      if (semesters.length > 0) semesterAnchor = { field, semesters };
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
      if (/^\d{4}-\d{2}-\d{2}$/.test(fs) && /^\d{4}-\d{2}-\d{2}$/.test(ts)) {
        betweenAnchor = { kind: "between", field, from: fs, to: ts };
      }
    }
  }

  if (fyAnchor) return fyAnchor;
  if (yearMonthAnchor) return { kind: "year_month", ...yearMonthAnchor };
  if (yearAnchor && monthOnlyAnchor) {
    return {
      kind: "month_only",
      field: monthOnlyAnchor.field,
      months: monthOnlyAnchor.months,
      yearField: yearAnchor.field,
      years: yearAnchor.years,
    };
  }
  if (yearAnchor && quarterAnchor && fieldsMatch(yearAnchor.field, quarterAnchor.field)) {
    return {
      kind: "quarter",
      field: quarterAnchor.field,
      quarters: quarterAnchor.quarters,
      years: yearAnchor.years,
    };
  }
  if (yearAnchor && semesterAnchor && fieldsMatch(yearAnchor.field, semesterAnchor.field)) {
    return {
      kind: "semester",
      field: semesterAnchor.field,
      semesters: semesterAnchor.semesters,
      years: yearAnchor.years,
    };
  }
  if (yearAnchor) return { kind: "year", ...yearAnchor };
  if (quarterAnchor) return { kind: "quarter", ...quarterAnchor };
  if (semesterAnchor) return { kind: "semester", ...semesterAnchor };
  if (monthOnlyAnchor) return { kind: "month_only", field: monthOnlyAnchor.field, months: monthOnlyAnchor.months };
  if (betweenAnchor) return betweenAnchor;
  return null;
}

function shiftYearMonthLabel(ym: string, mode: CompareTemporalMode): string | null {
  const iso = parseIsoYearMonthForLabel(ym);
  if (!iso) return null;
  if (modeNeedsPriorYear(mode)) {
    return `${iso.year - 1}-${String(iso.month).padStart(2, "0")}`;
  }
  if (modeNeedsPrevBucket(mode)) {
    const p = shiftCalendarYearMonth(iso.year, iso.month, -1);
    return `${p.year}-${String(p.month1).padStart(2, "0")}`;
  }
  return null;
}

function shiftFilterValue(
  filter: CompareContextFilter,
  compareSpec: CompareSpec,
  anchor: TemporalAnchor | null
): CompareContextFilter {
  if (compareSpec.kind !== "temporal") return { ...filter };

  const field = String(filter.field ?? "").trim();
  const op = String(filter.operator ?? "").toUpperCase().trim();
  const mode = compareSpec.mode;

  if (anchor?.kind === "fy" && isFyField(field) && (op === "=" || op === "IN" || op === "EQ")) {
    if (!modeNeedsPriorYear(mode) && !modeNeedsPrevBucket(mode)) return { ...filter };
    const shifted = collectStringValues(filter.value)
      .map((v) => shiftFyLabel(v, modeNeedsPriorYear(mode) ? -1 : -1))
      .filter((v): v is string => !!v);
    if (shifted.length === 0) return { ...filter };
    const unique = [...new Set(shifted)];
    return { ...filter, value: unique.length === 1 ? unique[0] : unique };
  }

  if (op === "YEAR_MONTH" || op === "MONTH") {
    const yms = collectYearMonths(filter.value);
    if (yms.length === 0 && op === "MONTH") {
      const months = collectNumbers(filter.value).filter((m) => m >= 1 && m <= 12);
      if (months.length > 0 && anchor?.kind === "month_only" && anchor.years?.length) {
        if (modeNeedsPriorYear(mode)) {
          const newYears = anchor.years.map((y) => y - 1);
          return { ...filter, value: months.length === 1 ? months[0] : months };
        }
      }
      return { ...filter };
    }
    const shifted = yms.map((ym) => shiftYearMonthLabel(ym, mode)).filter((v): v is string => !!v);
    if (shifted.length === 0) return { ...filter };
    const unique = [...new Set(shifted)];
    return { ...filter, value: unique.length === 1 ? unique[0] : unique };
  }

  if (op === "YEAR" && modeNeedsPriorYear(mode)) {
    const years = collectNumbers(filter.value).filter((y) => y >= 1900 && y <= 2100);
    if (years.length === 0) return { ...filter };
    const shifted = [...new Set(years.map((y) => y - 1))].sort((a, b) => a - b);
    return { ...filter, value: shifted.length === 1 ? shifted[0] : shifted };
  }

  if ((op === "=" || op === "EQ") && isYearLikeValue(filter.value) && modeNeedsPriorYear(mode)) {
    const y = Number(String(filter.value).trim());
    return { ...filter, value: y - 1 };
  }

  if (op === "IN" && isYearLikeValue(filter.value) && modeNeedsPriorYear(mode)) {
    const years = collectNumbers(filter.value).filter((y) => y >= 1900 && y <= 2100);
    if (years.length === 0) return { ...filter };
    const shifted = [...new Set(years.map((y) => y - 1))].sort((a, b) => a - b);
    return { ...filter, value: shifted };
  }

  if (op === "QUARTER" || op === "SEMESTER") {
    return { ...filter };
  }

  if (op === "BETWEEN" && modeNeedsPrevBucket(mode)) {
    let from: unknown;
    let to: unknown;
    const v = filter.value;
    if (Array.isArray(v) && v.length >= 2) [from, to] = v;
    else if (v && typeof v === "object") {
      from = (v as { from?: unknown }).from;
      to = (v as { to?: unknown }).to;
    } else return { ...filter };
    const fs = String(from ?? "").trim();
    const ts = String(to ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fs) || !/^\d{4}-\d{2}-\d{2}$/.test(ts)) return { ...filter };
    const d0 = new Date(`${fs}T00:00:00Z`);
    d0.setUTCMonth(d0.getUTCMonth() - 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    const newFrom = `${d0.getUTCFullYear()}-${pad(d0.getUTCMonth() + 1)}-${pad(d0.getUTCDate())}`;
    return { ...filter, value: Array.isArray(v) ? [newFrom, ts] : { ...(v as object), from: newFrom, to: ts } };
  }

  return { ...filter };
}

/** Desplaza filtros al contexto comparativo según CompareSpec. */
export function shiftFiltersForCompare(
  filters: readonly CompareContextFilter[],
  compareSpec: CompareSpec
): CompareContextFilter[] {
  if (compareSpec.kind !== "temporal" && compareSpec.kind !== "cumulative") {
    return filters.map((f) => ({ ...f }));
  }
  const anchor = extractTemporalAnchor(filters);
  return filters.map((f) => shiftFilterValue(f, compareSpec, anchor));
}

function buildCompareLabel(anchor: TemporalAnchor | null, compareSpec: CompareSpec): string | undefined {
  if (!anchor || compareSpec.kind !== "temporal") return undefined;
  if (anchor.kind === "fy") {
    const shifted = anchor.values.map((v) => shiftFyLabel(v, -1)).filter(Boolean);
    if (shifted.length > 0) return `vs ${shifted.join(", ")}`;
  }
  if (anchor.kind === "year_month" && compareSpec.mode === "same_period_prior_year") {
    const shifted = anchor.yearMonths
      .map((ym) => {
        const iso = parseIsoYearMonthForLabel(ym);
        return iso ? `${iso.year - 1}-${String(iso.month).padStart(2, "0")}` : null;
      })
      .filter(Boolean);
    if (shifted.length > 0) return `vs ${shifted.join(", ")}`;
  }
  if (compareSpec.mode === "same_period_prior_year") return "vs mismo período año anterior";
  if (compareSpec.mode === "prev_bucket") return "vs período anterior";
  return undefined;
}

export function compareSpecUsesDualQuery(spec: CompareSpec): boolean {
  return spec.kind === "temporal" || spec.kind === "cumulative";
}

export function resolveEffectiveCompareSpec(
  dashboardDefaults: DashboardCompareDefaults | undefined,
  widgetAgg: LegacyCompareInput & { compareInheritDashboard?: boolean }
): CompareSpec {
  const inherit = widgetAgg.compareInheritDashboard !== false;
  if (inherit && dashboardDefaults?.enabled && dashboardDefaults.compare && dashboardDefaults.compare.kind !== "none") {
    return dashboardDefaults.compare;
  }
  return normalizeAggregationCompare(legacyCompareInputFromWidgetAgg(widgetAgg));
}

export function resolveWidgetCompareUi(
  dashboardDefaults: DashboardCompareDefaults | undefined,
  widgetAgg: { compareInheritDashboard?: boolean; dashboardCompareUi?: DashboardCompareUi }
): DashboardCompareUi | undefined {
  const inherit = widgetAgg.compareInheritDashboard !== false;
  if (inherit && dashboardDefaults?.enabled) {
    return {
      enabled: true,
      label: dashboardDefaults.label,
      showDelta: dashboardDefaults.showDelta,
      showDeltaPct: dashboardDefaults.showDeltaPct,
      showCardHeaderStrip: dashboardDefaults.showCardHeaderStrip,
      ...widgetAgg.dashboardCompareUi,
    };
  }
  return widgetAgg.dashboardCompareUi;
}

export type BuildDashboardCompareContextsParams = {
  filters: readonly CompareContextFilter[];
  compareSpec: CompareSpec;
};

/**
 * Construye contexto actual y comparativo para consulta dual.
 * Regla: mismo contexto de negocio, dimensión temporal desplazada.
 */
export function buildDashboardCompareContexts(params: BuildDashboardCompareContextsParams): DashboardCompareContexts {
  const { filters, compareSpec } = params;
  const currentFilters = filters.map((f) => ({ ...f }));

  if (compareSpec.kind === "none") {
    return {
      currentFilters,
      comparativeFilters: currentFilters,
      comparable: false,
      unavailableReason: "Sin comparación activa",
      usesDualQuery: false,
    };
  }

  if (compareSpec.kind === "fixed" || compareSpec.kind === "column" || compareSpec.kind === "average" || compareSpec.kind === "total_share") {
    return {
      currentFilters,
      comparativeFilters: currentFilters,
      comparable: true,
      usesDualQuery: false,
    };
  }

  const anchor = extractTemporalAnchor(currentFilters);
  if (!anchor) {
    return {
      currentFilters,
      comparativeFilters: currentFilters,
      comparable: false,
      unavailableReason: "Sin período disponible",
      usesDualQuery: true,
    };
  }

  const comparativeFilters = shiftFiltersForCompare(currentFilters, compareSpec);
  const label = buildCompareLabel(anchor, compareSpec);

  return {
    currentFilters,
    comparativeFilters,
    comparable: true,
    compareLabel: label,
    usesDualQuery: true,
  };
}
