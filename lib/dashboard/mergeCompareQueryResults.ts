import type { CompareSpec } from "@/lib/dashboard/compareSpec";
import { shiftBucketLabelOneYear } from "@/lib/dashboard/compareMetricRows";
import { resolveRowColumnKey, getRowValue } from "@/lib/dashboard/compareMetricRows";
import type { DateGranularity, ParseDateLikeOptions } from "@/lib/dashboard/dateFormatting";

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function deltaPct(current: number | null, ref: number | null): number | null {
  if (current == null || ref == null) return null;
  if (ref === 0) return current === 0 ? 0 : null;
  return ((current - ref) / ref) * 100;
}

function partitionKey(row: Record<string, unknown>, dimCols: string[], exclude?: string): string {
  const ex = exclude ? exclude.replace(/\s+/g, "").toUpperCase() : "";
  const parts: string[] = [];
  for (const c of dimCols) {
    if (!c || c.replace(/\s+/g, "").toUpperCase() === ex) continue;
    const k = resolveRowColumnKey(row, c);
    parts.push(`${k ?? c}:${String(k != null ? row[k!] : "")}`);
  }
  return parts.join("\t");
}

function sumMetricInRows(rows: Record<string, unknown>[], alias: string): number {
  let total = 0;
  for (const row of rows) {
    const k = resolveRowColumnKey(row, alias);
    if (!k) continue;
    const n = Number(row[k]);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

export type MergeCompareQueryParams = {
  currentRows: Record<string, unknown>[];
  comparativeRows: Record<string, unknown>[];
  metricAliases: string[];
  compareSpec: CompareSpec;
  dimensionColumns: string[];
  timeColumn?: string;
  granularity?: DateGranularity;
  parseOpts?: ParseDateLikeOptions;
  /** KPI escalar: una fila sintética con totales. */
  scalarKpi?: boolean;
};

/**
 * Une resultados de consulta actual y comparativa (dual query dashboard).
 * Genera columnas `_prev`, `_delta`, `_delta_pct` compatibles con renderers existentes.
 */
export function mergeCompareQueryResults(params: MergeCompareQueryParams): Record<string, unknown>[] {
  const {
    currentRows,
    comparativeRows,
    metricAliases,
    compareSpec,
    dimensionColumns,
    timeColumn,
    granularity = "month",
    parseOpts,
    scalarKpi = false,
  } = params;

  if (!currentRows.length) return [];
  if (compareSpec.kind !== "temporal" && compareSpec.kind !== "cumulative") {
    return currentRows.map((r) => ({ ...r }));
  }

  if (scalarKpi || (!timeColumn && dimensionColumns.length === 0)) {
    const merged: Record<string, unknown> = { ...(currentRows[0] ?? {}) };
    for (const alias of metricAliases) {
      const k = resolveRowColumnKey(merged, alias) ?? alias;
      const current = sumMetricInRows(currentRows, alias);
      const reference = sumMetricInRows(comparativeRows, alias);
      merged[k] = current;
      merged[`${k}_prev`] = reference;
      merged[`${k}_delta`] = current - reference;
      merged[`${k}_delta_pct`] = deltaPct(current, reference);
    }
    return [merged];
  }

  const timeCol = timeColumn?.trim();
  if (!timeCol) {
    return mergeCompareQueryResults({ ...params, scalarKpi: true });
  }

  const compareMap = new Map<string, Record<string, unknown>>();
  for (const row of comparativeRows) {
    const pk = partitionKey(row, dimensionColumns, timeCol);
    const tVal = getRowValue(row, timeCol);
    const key = `${pk}\t${String(tVal ?? "")}`;
    compareMap.set(key, row);
  }

  return currentRows.map((row) => {
    const next = { ...row };
    const pk = partitionKey(row, dimensionColumns, timeCol);
    const tVal = getRowValue(row, timeCol);
    const shifted =
      compareSpec.kind === "temporal" && compareSpec.mode === "same_period_prior_year"
        ? shiftBucketLabelOneYear(tVal, granularity, parseOpts)
        : null;
    const lookKey = shifted != null ? `${pk}\t${shifted}` : `${pk}\t${String(tVal ?? "")}`;
    const compareRow = compareMap.get(lookKey);

    for (const alias of metricAliases) {
      const k = resolveRowColumnKey(next, alias);
      if (!k) continue;
      const v = toNum(next[k]);
      const vPrev = compareRow ? toNum(getRowValue(compareRow, alias)) : null;
      next[`${k}_prev`] = vPrev;
      next[`${k}_delta`] = v != null && vPrev != null ? v - vPrev : null;
      next[`${k}_delta_pct`] = deltaPct(v, vPrev);
    }
    return next;
  });
}

/** Filas de referencia para serie adicional en gráficos de línea (query comparativa). */
export function comparativeRowsForReferenceSeries(
  comparativeRows: Record<string, unknown>[],
  metricAliases: string[]
): Record<string, unknown>[] {
  return comparativeRows.map((row) => {
    const next = { ...row };
    for (const alias of metricAliases) {
      const k = resolveRowColumnKey(row, alias);
      if (!k) continue;
      const v = row[k];
      next[`${k}_prev`] = v;
    }
    return next;
  });
}
