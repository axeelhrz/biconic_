import { resolveDashboardKpiMainValue } from "@/lib/dashboard/compareDisplayKeys";

export type MetricDisplayRoleLike = {
  alias?: string;
  func?: string;
  field?: string;
  displayRole?: "measure" | "attribute";
};

export function isAttributeMetric(metric: MetricDisplayRoleLike | undefined | null): boolean {
  if (!metric) return false;
  if (metric.displayRole === "attribute") return true;
  return String(metric.func ?? "").trim().toUpperCase() === "ATTRIBUTE";
}

export function metricResultKey(metric: MetricDisplayRoleLike | undefined, index?: number): string {
  if (!metric) return index != null ? `metric_${index}` : "";
  const alias = String(metric.alias ?? "").trim();
  if (alias) return alias;
  const field = String(metric.field ?? "").trim();
  const func = String(metric.func ?? "").trim();
  if (func && field) return `${func}(${field})`;
  return index != null ? `metric_${index}` : field;
}

export function findMetricForResultKey(
  yKey: string,
  metrics: MetricDisplayRoleLike[] | undefined
): MetricDisplayRoleLike | undefined {
  if (!metrics?.length || !yKey.trim()) return undefined;
  const target = yKey.trim();
  const metricIndexMatch = target.match(/^metric_(\d+)$/);
  if (metricIndexMatch) {
    const idx = Number(metricIndexMatch[1]);
    if (Number.isInteger(idx) && metrics[idx]) return metrics[idx];
  }
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    if (!m) continue;
    if (metricResultKey(m, i) === target) return m;
    if (String(m.alias ?? "").trim() === target) return m;
    if (String(m.field ?? "").trim() === target) return m;
  }
  return undefined;
}

export function isAttributeResultKey(yKey: string, metrics: MetricDisplayRoleLike[] | undefined): boolean {
  return isAttributeMetric(findMetricForResultKey(yKey, metrics));
}

export function metricDisplayTextForRow(row: Record<string, unknown>, yKey: string): string {
  const v = row[yKey];
  if (v == null) return "";
  return String(v);
}

/** Altura nominal en gráficos cartesianos cuando la métrica es texto/atributo. */
export function metricChartNumericValue(
  row: Record<string, unknown>,
  yKey: string,
  isAttribute: boolean
): number {
  if (!isAttribute) {
    const n = Number(row[yKey] ?? 0);
    return Number.isFinite(n) ? n : 0;
  }
  const text = metricDisplayTextForRow(row, yKey);
  return text.trim() !== "" ? 1 : 0;
}

export function resolveDashboardKpiDisplayValue(
  rows: Record<string, unknown>[],
  yKey: string,
  isAttribute: boolean
): string | number {
  if (!isAttribute) return resolveDashboardKpiMainValue(rows, yKey);
  for (const row of rows) {
    const text = metricDisplayTextForRow(row, yKey);
    if (text.trim() !== "") return text;
  }
  return "—";
}

/**
 * Elige la fila con mayor/menor métrica y devuelve el valor de la dimensión asociada.
 * Ej.: medio con mayor reach → "Instagram".
 */
export function resolveArgmaxDimensionLabel(
  rows: Record<string, unknown>[],
  metricKey: string,
  dimensionKey: string,
  pick: "max" | "min" = "max"
): string {
  const mKey = String(metricKey ?? "").trim();
  const dKey = String(dimensionKey ?? "").trim();
  if (!mKey || !dKey || !Array.isArray(rows) || rows.length === 0) return "—";

  let bestRow: Record<string, unknown> | null = null;
  let bestVal = pick === "max" ? -Infinity : Infinity;

  for (const row of rows) {
    const n = Number(row[mKey]);
    if (!Number.isFinite(n)) continue;
    const better = pick === "max" ? n > bestVal : n < bestVal;
    if (better || bestRow == null) {
      bestVal = n;
      bestRow = row;
    }
  }

  if (!bestRow) return "—";
  const label = bestRow[dKey];
  if (label == null || String(label).trim() === "") return "—";
  return String(label);
}

/** ¿El análisis/widget debe mostrar la dimensión asociada en lugar del número? */
export function wantsAttributeDimensionDisplay(agg: {
  resultDisplayMode?: string;
  resultAttributeDimension?: string;
} | null | undefined): boolean {
  if (!agg) return false;
  const mode = String(agg.resultDisplayMode ?? "").trim().toLowerCase();
  const dim = String(agg.resultAttributeDimension ?? "").trim();
  return (mode === "dimension" || mode === "attribute") && dim !== "";
}
