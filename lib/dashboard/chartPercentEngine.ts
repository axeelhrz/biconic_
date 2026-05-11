import {
  buildChartConfig,
  getProcessedRowsForChart,
  resolveChartYAxisEntryToResultKey,
  resolveWidgetAxisKeys,
  type BuildChartConfigWidget,
  type ChartConfig,
} from "@/lib/dashboard/buildChartConfig";
import { normalizeChartPercentBasis, resolvePercentDenominator, sumFiniteNumbers } from "@/lib/dashboard/chartOptions";

export type ChartPercentWidgetLike = BuildChartConfigWidget & {
  chartPercentGroupField?: string;
  chartPercentDenominatorMetric?: string;
  /** Ámbito de suma del denominador (solo modo `per_denominator_metric`). */
  chartPercentDenominatorScope?: "analysis" | "visible";
  /** Si true, suma el denominador en todo el ámbito; si false, por valor crudo del eje X (y serie si aplica). */
  chartPercentDenominatorGrandTotal?: boolean;
};

function sumDatasetValues(cfg: ChartConfig | null | undefined): number {
  if (!cfg?.datasets) return 0;
  let s = 0;
  for (const ds of cfg.datasets) {
    if (Array.isArray(ds.data)) s += sumFiniteNumbers(ds.data);
  }
  return s;
}

function resolveGroupFieldKey(raw: string | undefined, resultKeys: string[]): string | null {
  if (!raw || !String(raw).trim()) return null;
  const t = String(raw).trim();
  if (resultKeys.includes(t)) return t;
  const tl = t.toLowerCase();
  for (const k of resultKeys) {
    if (k.toLowerCase() === tl) return k;
  }
  return null;
}

function resolveDenominatorMetricKey(
  raw: string | undefined,
  widget: BuildChartConfigWidget,
  resultKeys: string[],
  yKeys: string[]
): string | null {
  if (!raw || !String(raw).trim()) return null;
  const metrics = (widget.aggregationConfig?.metrics ?? []) as Array<{ alias?: string; func?: string; field?: string }>;
  return resolveChartYAxisEntryToResultKey(String(raw).trim(), metrics, resultKeys);
}

function getSeriesField(widget: BuildChartConfigWidget, xKey: string, resultKeys: string[]): string | null {
  const agg = widget.aggregationConfig;
  const configured = String(agg?.chartSeriesField ?? "").trim();
  const fallback = String(agg?.dimension2 ?? "").trim();
  const field = [configured, fallback].find((f) => f && f !== xKey && resultKeys.includes(f));
  return field ?? null;
}

/** Misma convención que buildChartConfig: orden de primera aparición en filas. */
function orderedSeriesValues(rows: Record<string, unknown>[], seriesField: string): string[] {
  return [...new Set(rows.map((r) => String((r as Record<string, unknown>)[seriesField] ?? "")))];
}

/**
 * Crea (dataIndex, datasetIndex) → denominador para tooltips / datalabels.
 */
export function createChartPercentDenominatorResolver(params: {
  basisRaw: unknown;
  fullRows: Record<string, unknown>[] | undefined;
  widget: ChartPercentWidgetLike;
  chartConfig: ChartConfig | null | undefined;
  accentColor?: string;
}): (dataIndex: number, datasetIndex: number) => number | undefined {
  const basis = normalizeChartPercentBasis(params.basisRaw);
  const chartConfig = params.chartConfig;
  const fullRows = Array.isArray(params.fullRows) ? params.fullRows : [];
  const widget = params.widget;
  const accent = params.accentColor ?? "";

  if (!chartConfig?.datasets?.length) {
    return () => undefined;
  }

  if (
    basis === "chart_visible_total" ||
    basis === "grand_total" ||
    basis === "per_series" ||
    basis === "per_category" ||
    basis === "per_category_axis"
  ) {
    return (di, dsi) => resolvePercentDenominator(basis, chartConfig.datasets, di, dsi);
  }

  if (fullRows.length === 0) {
    return (di, dsi) => resolvePercentDenominator("chart_visible_total", chartConfig.datasets, di, dsi);
  }

  const axis = resolveWidgetAxisKeys(fullRows, widget);
  if (!axis) {
    return (di, dsi) => resolvePercentDenominator("chart_visible_total", chartConfig.datasets, di, dsi);
  }
  const { xKey, yKeys, resultKeys } = axis;

  const analysisRows = getProcessedRowsForChart(fullRows, widget, { applyRankingSlice: false });
  const visibleRows = getProcessedRowsForChart(fullRows, widget, { applyRankingSlice: true });
  const analysisCfg = buildChartConfig(fullRows, widget, accent, { skipRanking: true }) ?? chartConfig;

  const xRawArr = chartConfig.xRawCategoryKeys;
  const rawXAt = (di: number): string => {
    if (xRawArr && di >= 0 && di < xRawArr.length) return xRawArr[di] ?? "";
    const r = visibleRows[di] as Record<string, unknown> | undefined;
    return r ? String(r[xKey] ?? "") : "";
  };

  const denomKey = resolveDenominatorMetricKey(widget.chartPercentDenominatorMetric, widget, resultKeys, yKeys);
  const groupField = resolveGroupFieldKey(widget.chartPercentGroupField, resultKeys);
  const seriesField = getSeriesField(widget, xKey, resultKeys);

  const sumMetric = (rows: Record<string, unknown>[], key: string | null): number => {
    if (!key) return 0;
    let s = 0;
    for (const row of rows) {
      const n = Number((row as Record<string, unknown>)[key] ?? 0);
      if (Number.isFinite(n)) s += n;
    }
    return s;
  };

  const yKeyAt = (datasetIndex: number): string | null => {
    if (datasetIndex >= 0 && datasetIndex < yKeys.length) return yKeys[datasetIndex]!;
    return yKeys[0] ?? null;
  };

  if (basis === "analysis_total") {
    const total = sumDatasetValues(analysisCfg);
    return () => total;
  }

  if (basis === "per_dimension_group") {
    if (!groupField) {
      return (di, dsi) => resolvePercentDenominator("per_category_axis", chartConfig.datasets, di, dsi);
    }
    const scopeRows = analysisRows;
    const pivotSeriesCount = seriesField ? orderedSeriesValues(visibleRows, seriesField).length : 0;
    const segmentDatasetCount =
      pivotSeriesCount > 0
        ? Math.min(chartConfig.datasets.length, pivotSeriesCount)
        : chartConfig.datasets.length;

    return (di, dsi) => {
      const yk = yKeyAt(dsi);
      let gVal: string | null = null;
      if (seriesField && dsi < segmentDatasetCount) {
        const rawX = rawXAt(di);
        const sv = orderedSeriesValues(visibleRows, seriesField);
        const seriesRaw = dsi >= 0 && dsi < sv.length ? sv[dsi]! : "";
        const hit = visibleRows.find(
          (r) =>
            String((r as Record<string, unknown>)[xKey] ?? "") === rawX &&
            String((r as Record<string, unknown>)[seriesField] ?? "") === seriesRaw
        );
        gVal = hit ? String((hit as Record<string, unknown>)[groupField] ?? "") : null;
      } else {
        const hit = visibleRows.find((r) => String((r as Record<string, unknown>)[xKey] ?? "") === rawXAt(di));
        gVal = hit ? String((hit as Record<string, unknown>)[groupField] ?? "") : null;
      }
      if (gVal == null) return resolvePercentDenominator("per_category_axis", chartConfig.datasets, di, dsi);
      let sumG = 0;
      for (const row of scopeRows) {
        if (String((row as Record<string, unknown>)[groupField] ?? "") !== gVal) continue;
        const n = Number(yk ? (row as Record<string, unknown>)[yk] ?? 0 : 0);
        if (Number.isFinite(n)) sumG += n;
      }
      return sumG;
    };
  }

  if (basis === "per_denominator_metric") {
    if (!denomKey) {
      return (di, dsi) => resolvePercentDenominator("chart_visible_total", chartConfig.datasets, di, dsi);
    }
    const scopePrefer = widget.chartPercentDenominatorScope ?? "analysis";
    const scopeRows = scopePrefer === "visible" ? visibleRows : analysisRows;
    const grand = widget.chartPercentDenominatorGrandTotal === true;
    const pivotSeriesCount = seriesField ? orderedSeriesValues(visibleRows, seriesField).length : 0;
    const segmentDatasetCount =
      pivotSeriesCount > 0
        ? Math.min(chartConfig.datasets.length, pivotSeriesCount)
        : chartConfig.datasets.length;

    return (di, dsi) => {
      if (grand) return sumMetric(scopeRows, denomKey);
      const rawX = rawXAt(di);
      let s = 0;
      if (seriesField && dsi < segmentDatasetCount) {
        const sv = orderedSeriesValues(visibleRows, seriesField);
        const seriesRaw = dsi >= 0 && dsi < sv.length ? sv[dsi]! : "";
        for (const row of scopeRows) {
          if (String((row as Record<string, unknown>)[xKey] ?? "") !== rawX) continue;
          if (String((row as Record<string, unknown>)[seriesField] ?? "") !== seriesRaw) continue;
          const n = Number((row as Record<string, unknown>)[denomKey] ?? 0);
          if (Number.isFinite(n)) s += n;
        }
        return s;
      }
      for (const row of scopeRows) {
        if (String((row as Record<string, unknown>)[xKey] ?? "") !== rawX) continue;
        const n = Number((row as Record<string, unknown>)[denomKey] ?? 0);
        if (Number.isFinite(n)) s += n;
      }
      return s;
    };
  }

  return (di, dsi) => resolvePercentDenominator("chart_visible_total", chartConfig.datasets, di, dsi);
}
