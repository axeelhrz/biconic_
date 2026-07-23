import type { ChartConfig, BuildChartConfigWidget } from "@/lib/dashboard/buildChartConfig";
import { normalizeAggregationCompare, type CompareSpec } from "@/lib/dashboard/compareSpec";
import { pickDateGroupBySourceField } from "@/lib/dashboard/dateGroupBySourceField";
import { getCompareColumnKeys } from "@/lib/dashboard/compareDisplayKeys";
import { getEffectiveDashboardCompareUi, effectivePlacementEnabled } from "@/lib/dashboard/ensureDashboardCompareUi";
import { effectiveWidgetChartType } from "@/lib/dashboard/effectiveWidgetChartType";
import { resolveChartMetricYAxisId } from "@/lib/dashboard/chartMetricAxis";

function compareSpecFromAgg(agg: BuildChartConfigWidget["aggregationConfig"] | undefined) {
  return normalizeAggregationCompare({
    compare: agg?.compare,
    comparePeriod:
      agg?.comparePeriod === "previous_year" || agg?.comparePeriod === "previous_month"
        ? agg.comparePeriod
        : undefined,
    compareFixedValue: typeof agg?.compareFixedValue === "number" ? agg.compareFixedValue : undefined,
    transformCompare: agg?.transformCompare as string | undefined,
    transformCompareFixedValue: agg?.transformCompareFixedValue as string | undefined,
    dateGroupBy:
      agg?.dateGroupByGranularity && pickDateGroupBySourceField(agg)
        ? { field: pickDateGroupBySourceField(agg)!, granularity: String(agg.dateGroupByGranularity) }
        : undefined,
    dateDimension: agg?.dateDimension as string | undefined,
  });
}

function defaultCompareSeriesLabel(spec: CompareSpec, uiLabel: string | undefined, metricLabel: string): string {
  const custom = (uiLabel ?? "").trim();
  if (custom) return custom.slice(0, 120);
  const base =
    spec.kind === "fixed"
      ? "Objetivo"
      : spec.kind === "temporal"
        ? "Periodo anterior"
        : spec.kind === "average"
          ? "Promedio"
          : spec.kind === "column"
            ? "Referencia"
            : spec.kind === "total_share"
              ? "Total"
              : spec.kind === "cumulative"
                ? "Acumulado"
                : spec.kind === "comparative"
                  ? "Comparativo"
                  : "Referencia";
  return metricLabel && metricLabel !== base ? `${base} (${metricLabel})` : base;
}

const COMPARE_SERIES_CHART_TYPES = new Set(["line", "area", "bar", "horizontalBar", "stackedColumn", "combo"]);

/**
 * Añade series de comparación (periodo anterior, objetivo, etc.) como datasets de línea.
 * Debe usarse con las mismas filas `rows` ya ordenadas que las usadas para construir `datasets`.
 */
export function appendCompareLineDatasetsIfConfigured(
  resolvedType: string,
  rows: Record<string, unknown>[],
  widget: BuildChartConfigWidget,
  yKeys: string[],
  datasets: ChartConfig["datasets"],
  lineStrokeW: number
): ChartConfig["datasets"] {
  const agg = widget.aggregationConfig;
  const chartType = effectiveWidgetChartType(widget);
  const aggCompare = agg as import("@/lib/dashboard/ensureDashboardCompareUi").AggForDashboardCompareUi;
  const ui = getEffectiveDashboardCompareUi(aggCompare, { widgetType: widget.type, chartType });
  if (!effectivePlacementEnabled(aggCompare, "line_reference_series", { widgetType: widget.type, chartType })) {
    return datasets;
  }
  const spec = compareSpecFromAgg(agg);
  if (spec.kind === "none") return datasets;
  if (!COMPARE_SERIES_CHART_TYPES.has(resolvedType)) return datasets;
  if (!yKeys.length || !rows.length) return datasets;

  const sample = rows[0] as Record<string, unknown>;
  const added = new Set<string>();
  const out = [...datasets];

  for (let i = 0; i < yKeys.length; i++) {
    const y0 = yKeys[i]!;
    const keys = getCompareColumnKeys(spec, y0, sample);
    const refKey = keys.referenceSeriesKey;
    if (!refKey || added.has(refKey)) continue;
    if (!rows.some((r) => Object.prototype.hasOwnProperty.call(r as object, refKey))) continue;
    added.add(refKey);

    const metricLabel = String(
      (agg?.chartDatasetLabelOverrides as Record<string, string> | undefined)?.[y0] ?? y0
    ).trim();
    const label = defaultCompareSeriesLabel(spec, ui?.label, yKeys.length > 1 ? metricLabel : "");
    const data = rows.map((r) => Number((r as Record<string, unknown>)[refKey] ?? NaN));
    const yAxisID = resolveChartMetricYAxisId(y0, i, agg, resolvedType, yKeys.length);

    out.push({
      label,
      data,
      borderColor: "#94a3b8",
      backgroundColor: "transparent",
      borderWidth: Math.max(1, lineStrokeW),
      borderDash: [6, 4],
      fill: false,
      type: "line" as const,
      ...(yAxisID ? { yAxisID } : {}),
    });
  }

  return out;
}
