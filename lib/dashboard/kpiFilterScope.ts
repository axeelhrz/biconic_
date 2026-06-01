import { compareBucketSortTime, getRowValue, resolveRowColumnKey } from "@/lib/dashboard/compareMetricRows";
import { resolveDashboardKpiMainValue } from "@/lib/dashboard/compareDisplayKeys";
import type { DateGranularity, ParseDateLikeOptions } from "@/lib/dashboard/dateFormatting";
import { parseIsoYearMonthForLabel } from "@/lib/dashboard/dateFormatting";

export type KpiScopeFilterLike = {
  field?: string;
  operator?: string;
  value?: unknown;
};

function collectAllowedYearsFromUserFilters(userFilters: KpiScopeFilterLike[]): Set<number> | null {
  const years = new Set<number>();
  for (const f of userFilters) {
    if (String(f.operator ?? "").toUpperCase() !== "YEAR") continue;
    const raw = f.value;
    if (raw == null || raw === "") continue;
    const parts = Array.isArray(raw) ? raw : [raw];
    for (const p of parts) {
      const n = Number(p);
      if (Number.isFinite(n) && n >= 1900 && n <= 2100) years.add(Math.round(n));
    }
  }
  return years.size > 0 ? years : null;
}

function collectAllowedYearMonthsFromUserFilters(userFilters: KpiScopeFilterLike[]): Set<string> | null {
  const yms = new Set<string>();
  for (const f of userFilters) {
    const op = String(f.operator ?? "").toUpperCase();
    if (op !== "MONTH" && op !== "YEAR_MONTH") continue;
    const raw = f.value;
    if (raw == null || raw === "") continue;
    const parts = Array.isArray(raw) ? raw : [raw];
    for (const p of parts) {
      const iso = parseIsoYearMonthForLabel(p);
      if (iso) {
        yms.add(`${iso.year}-${String(iso.month).padStart(2, "0")}`);
        continue;
      }
      const s = String(p ?? "").trim();
      const m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?/.exec(s);
      if (m) yms.add(`${m[1]}-${String(Number(m[2])).padStart(2, "0")}`);
    }
  }
  return yms.size > 0 ? yms : null;
}

export type KpiUserTimeScopeOptions = {
  timeColumn: string;
  granularity: DateGranularity;
  userFilters: KpiScopeFilterLike[];
  parseOpts?: ParseDateLikeOptions;
};

/**
 * Filas visibles para el total del KPI: excluye buckets traídos solo por expansión de comparación
 * (p. ej. meses 2025 cuando el usuario filtró YEAR=2026).
 */
export function filterRowsToUserTimeScope(
  rows: Record<string, unknown>[],
  options: KpiUserTimeScopeOptions
): Record<string, unknown>[] {
  if (!rows.length) return rows;
  const timeCol = options.timeColumn?.trim();
  if (!timeCol) return rows;

  const allowedYears = collectAllowedYearsFromUserFilters(options.userFilters);
  const allowedYearMonths = collectAllowedYearMonthsFromUserFilters(options.userFilters);
  if (!allowedYears && !allowedYearMonths) return rows;

  return rows.filter((row) => {
    const raw = getRowValue(row, timeCol);
    if (allowedYearMonths) {
      const iso = parseIsoYearMonthForLabel(raw);
      const ym = iso
        ? `${iso.year}-${String(iso.month).padStart(2, "0")}`
        : (() => {
            const s = String(raw ?? "").trim();
            const m = /^(\d{4})-(\d{1,2})/.exec(s);
            return m ? `${m[1]}-${String(Number(m[2])).padStart(2, "0")}` : "";
          })();
      if (ym) return allowedYearMonths.has(ym);
    }
    if (allowedYears) {
      const t = compareBucketSortTime(raw, options.granularity, options.parseOpts);
      if (!Number.isNaN(t)) {
        return allowedYears.has(new Date(t).getUTCFullYear());
      }
      const y = Number(String(raw ?? "").trim());
      if (Number.isFinite(y) && y >= 1900 && y <= 2100) return allowedYears.has(Math.round(y));
    }
    return true;
  });
}

export function resolveDashboardKpiMainValueForScope(
  rows: Record<string, unknown>[],
  yKey: string,
  scopeOptions?: KpiUserTimeScopeOptions | null
): number {
  const scoped = scopeOptions ? filterRowsToUserTimeScope(rows, scopeOptions) : rows;
  return resolveDashboardKpiMainValue(scoped, yKey);
}
