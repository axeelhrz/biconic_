import type { ChartConfig, BuildChartConfigWidget } from "@/lib/dashboard/buildChartConfig";
import { normalizeAggregationCompare } from "@/lib/dashboard/compareSpec";
import { pickDateGroupBySourceField } from "@/lib/dashboard/dateGroupBySourceField";
import {
  getCompareColumnKeys,
  placementEnabled,
  type DashboardCompareUi,
} from "@/lib/dashboard/compareDisplayKeys";

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

/**
 * Añade una serie de línea (referencia / periodo anterior) cuando el widget lo solicita.
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
  const ui = agg?.dashboardCompareUi as DashboardCompareUi | undefined;
  if (!ui?.enabled || !placementEnabled(ui, "line_reference_series")) return datasets;
  const spec = compareSpecFromAgg(agg);
  if (spec.kind === "none") return datasets;
  if (resolvedType !== "line" && resolvedType !== "area") return datasets;
  const y0 = yKeys[0];
  if (!y0 || !rows.length) return datasets;
  const sample = rows[0] as Record<string, unknown>;
  const keys = getCompareColumnKeys(spec, y0, sample);
  const refKey = keys.referenceSeriesKey;
  if (!refKey || !rows.some((r) => Object.prototype.hasOwnProperty.call(r as object, refKey))) return datasets;
  const label = (ui.label?.trim() || "Referencia").slice(0, 120);
  const data = rows.map((r) => Number((r as Record<string, unknown>)[refKey] ?? NaN));
  return [
    ...datasets,
    {
      label,
      data,
      borderColor: "#94a3b8",
      borderWidth: lineStrokeW,
      fill: false,
      type: "line" as const,
    } as (typeof datasets)[number],
  ];
}
