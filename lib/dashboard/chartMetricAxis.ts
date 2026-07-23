/**
 * Asignación de métricas a eje Y izquierdo (y) / derecho (y1).
 */

export type ChartMetricAxisSide = "left" | "right";

export type ChartMetricAxisAggLike = {
  chartDualAxis?: boolean;
  chartMetricAxis?: Record<string, ChartMetricAxisSide | string>;
  chartType?: string;
  chartYAxes?: string[];
};

/** ¿El gráfico debe montar doble eje (y + y1)? */
export function chartUsesDualAxis(
  agg: ChartMetricAxisAggLike | null | undefined,
  resolvedType: string,
  yKeysCount: number
): boolean {
  if (yKeysCount < 2) return false;
  const t = String(resolvedType || agg?.chartType || "").trim();
  if (t === "combo") return true;
  return agg?.chartDualAxis === true;
}

/**
 * Resuelve yAxisID Chart.js para una métrica.
 * - Sin doble eje: undefined (eje único).
 * - Con doble eje / combo: left→y, right→y1; default índice 0 = left, resto = right.
 */
export function resolveChartMetricYAxisId(
  yKey: string,
  index: number,
  agg: ChartMetricAxisAggLike | null | undefined,
  resolvedType: string,
  yKeysCount: number
): "y" | "y1" | undefined {
  if (!chartUsesDualAxis(agg, resolvedType, yKeysCount)) return undefined;
  const raw = String(agg?.chartMetricAxis?.[yKey] ?? "").trim().toLowerCase();
  if (raw === "right" || raw === "y1") return "y1";
  if (raw === "left" || raw === "y") return "y";
  return index === 0 ? "y" : "y1";
}

/** Tipos de gráfico donde tiene sentido ofrecer doble eje con 2+ métricas. */
export function chartTypeSupportsDualAxisUi(chartType: string | undefined | null): boolean {
  const t = String(chartType ?? "").trim();
  return (
    t === "line" ||
    t === "area" ||
    t === "bar" ||
    t === "horizontalBar" ||
    t === "stackedColumn" ||
    t === "combo"
  );
}
