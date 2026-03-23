/**
 * Construcción unificada de ChartConfig para dashboards.
 * Usado tanto en el editor (AdminDashboardStudio) como en la vista final (DashboardViewer)
 * para que la visualización sea idéntica en ambos contextos.
 */

import { formatDateByGranularity, parseDateLike, type DateGranularity } from "@/lib/dashboard/dateFormatting";

export type ChartConfig = {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    hoverBackgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    fill?: boolean;
    type?: "bar" | "line";
    yAxisID?: string;
  }>;
};

export type BuildChartConfigWidget = {
  type: string;
  aggregationConfig?: {
    enabled?: boolean;
    dimension?: string;
    dimensions?: string[];
    dimension2?: string;
    metrics?: Array<{ alias?: string; func?: string; field?: string }>;
    chartXAxis?: string;
    chartYAxes?: string[];
    chartSeriesField?: string;
    dateDimension?: string;
    dateGroupByGranularity?: DateGranularity;
    chartType?: string;
    chartSeriesColors?: Record<string, string>;
    chartLabelOverrides?: Record<string, string>;
    chartRankingEnabled?: boolean;
    chartRankingTop?: number;
    chartRankingMetric?: string;
    chartSortDirection?: string;
    chartSortBy?: string;
    chartSortByMetric?: string;
    chartAxisOrder?: string;
    [key: string]: unknown;
  };
  source?: { labelField?: string };
  color?: string;
};

function shouldApplyTemporalRankingRule(
  rows: Record<string, unknown>[],
  xKey: string,
  agg?: BuildChartConfigWidget["aggregationConfig"]
): boolean {
  const normalizedDateDim = String(agg?.dateDimension ?? "").trim().toLowerCase();
  const normalizedXKey = String(xKey ?? "").trim().toLowerCase();
  return (
    !!agg?.dateGroupByGranularity ||
    (normalizedDateDim !== "" && normalizedDateDim === normalizedXKey) ||
    rows.some((r) => parseDateLike((r as Record<string, unknown>)[xKey]) != null)
  );
}

/**
 * Aplica el mismo orden y ranking que buildChartConfig y devuelve las filas procesadas.
 * Usar para widgets tipo "table" para que la tabla muestre el mismo orden y Top N que los gráficos.
 */
export function getProcessedRowsForChart(
  dataArray: Record<string, unknown>[],
  widget: BuildChartConfigWidget
): Record<string, unknown>[] {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return [];
  const sample = dataArray[0] || {};
  const resultKeys = Object.keys(sample);
  const agg = widget.aggregationConfig;
  const metricAliases =
    agg?.enabled && agg.metrics?.length
      ? agg.metrics.map((m) => m.alias || `${m.func}(${m.field})`).filter(Boolean)
      : [];
  const xKey =
    agg?.chartXAxis && resultKeys.includes(agg.chartXAxis)
      ? agg.chartXAxis
      : (agg?.dimension ||
          widget.source?.labelField ||
          resultKeys.find((k) => !metricAliases.includes(k) && typeof (sample as Record<string, unknown>)[k] === "string") ||
          resultKeys[0]);
  let yKeys: string[] = [];
  if (Array.isArray(agg?.chartYAxes) && agg.chartYAxes.length > 0) {
    yKeys = agg.chartYAxes.filter((k) => resultKeys.includes(k));
  }
  if (yKeys.length === 0 && metricAliases.length > 0) {
    yKeys = metricAliases.filter((k) => resultKeys.includes(k));
  }
  if (yKeys.length === 0) {
    const numKeys = resultKeys.filter((k) => typeof (sample as Record<string, unknown>)[k] === "number");
    yKeys = numKeys.length > 0 ? numKeys : resultKeys.filter((k) => k !== xKey).slice(0, 1);
  }
  if (!xKey || yKeys.length === 0) return [...dataArray];

  let rows = [...dataArray];

  const isTemporalXAxis = shouldApplyTemporalRankingRule(dataArray, xKey, agg);
  const shouldApplyRanking = !!agg?.chartRankingEnabled && (agg?.chartRankingTop ?? 0) > 0 && !isTemporalXAxis;
  if (shouldApplyRanking) {
    let rKey = yKeys[0] || resultKeys[0];
    if (agg?.chartRankingMetric) {
      if (resultKeys.includes(agg.chartRankingMetric as string)) {
        rKey = agg.chartRankingMetric as string;
      } else {
        const metricMatch = (agg.chartRankingMetric as string).match(/^metric_(\d+)$/);
        if (metricMatch) {
          const idx = parseInt(metricMatch[1]!, 10);
          const resolved = yKeys[idx];
          if (resolved != null && resultKeys.includes(resolved)) rKey = resolved;
        }
      }
    }
    if (rKey) {
      rows.sort((a, b) => Number((b as Record<string, unknown>)[rKey] ?? 0) - Number((a as Record<string, unknown>)[rKey] ?? 0));
      rows = rows.slice(0, agg.chartRankingTop as number);
    }
  } else if (agg?.chartSortDirection && agg.chartSortDirection !== "none") {
    const sortByDimension = (agg.chartSortBy as string) === "dimension" || (agg.chartSortBy as string) === "axis";
    let sortField = yKeys[0] || xKey;
    if (!sortByDimension && agg?.chartSortByMetric) {
      if (resultKeys.includes(agg.chartSortByMetric as string)) {
        sortField = agg.chartSortByMetric as string;
      } else {
        const metricMatch = (agg.chartSortByMetric as string).match(/^metric_(\d+)$/);
        if (metricMatch) {
          const idx = parseInt(metricMatch[1]!, 10);
          const resolved = yKeys[idx];
          if (resolved != null && resultKeys.includes(resolved)) sortField = resolved;
        }
      }
    } else if (sortByDimension) {
      sortField = xKey;
    }
    const dir = (agg.chartSortDirection as string) === "asc" ? 1 : -1;
    const axisOrder = agg.chartAxisOrder as string | undefined;
    rows.sort((a, b) => {
      if (sortField === xKey && axisOrder && ["alpha", "date_asc", "date_desc"].includes(axisOrder)) {
        const va = (a as Record<string, unknown>)[xKey];
        const vb = (b as Record<string, unknown>)[xKey];
        if (axisOrder === "date_asc" || axisOrder === "date_desc") {
          const ta = typeof va === "string" || typeof va === "number" ? new Date(va as string | number).getTime() : 0;
          const tb = typeof vb === "string" || typeof vb === "number" ? new Date(vb as string | number).getTime() : 0;
          return axisOrder === "date_asc" ? ta - tb : tb - ta;
        }
        const sa = String(va ?? "");
        const sb = String(vb ?? "");
        return axisOrder === "alpha" ? sa.localeCompare(sb, undefined, { numeric: true }) : sb.localeCompare(sa, undefined, { numeric: true });
      }
      const va = Number((a as Record<string, unknown>)[sortField] ?? 0);
      const vb = Number((b as Record<string, unknown>)[sortField] ?? 0);
      return isNaN(va) || isNaN(vb)
        ? String((a as Record<string, unknown>)[sortField] ?? "").localeCompare(String((b as Record<string, unknown>)[sortField] ?? "")) * dir
        : (va - vb) * dir;
    });
  }
  return rows;
}

const DEFAULT_PALETTE = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

/**
 * Construye la configuración del gráfico a partir de filas de datos y la configuración del widget.
 * Incluye ordenación (chartSortDirection, chartSortBy, chartAxisOrder) y ranking (chartRankingEnabled)
 * para que editor y viewer muestren exactamente los mismos datos en el mismo orden.
 */
export function buildChartConfig(
  dataArray: Record<string, unknown>[],
  widget: BuildChartConfigWidget,
  accentColor: string = ""
): ChartConfig | undefined {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return undefined;
  const sample = dataArray[0] || {};
  const resultKeys = Object.keys(sample);
  const agg = widget.aggregationConfig;
  const metricAliases =
    agg?.enabled && agg.metrics?.length
      ? agg.metrics.map((m) => m.alias || `${m.func}(${m.field})`).filter(Boolean)
      : [];
  const xKey =
    agg?.chartXAxis && resultKeys.includes(agg.chartXAxis)
      ? agg.chartXAxis
      : (agg?.dimension ||
          widget.source?.labelField ||
          resultKeys.find((k) => !metricAliases.includes(k) && typeof (sample as Record<string, unknown>)[k] === "string") ||
          resultKeys[0]);
  let yKeys: string[] = [];
  if (Array.isArray(agg?.chartYAxes) && agg.chartYAxes.length > 0) {
    yKeys = agg.chartYAxes.filter((k) => resultKeys.includes(k));
  }
  if (yKeys.length === 0 && metricAliases.length > 0) {
    yKeys = metricAliases.filter((k) => resultKeys.includes(k));
  }
  if (yKeys.length === 0) {
    const numKeys = resultKeys.filter((k) => typeof (sample as Record<string, unknown>)[k] === "number");
    yKeys = numKeys.length > 0 ? numKeys : resultKeys.filter((k) => k !== xKey).slice(0, 1);
  }
  if (!xKey || yKeys.length === 0) return undefined;

  const overrides = agg?.chartLabelOverrides;
  const labelOverride = (v: string): string => {
    if (!overrides) return v;
    const s = String(v ?? "").trim();
    if (s === "") return v;
    if (s in overrides) return overrides[s];
    for (const [k, val] of Object.entries(overrides)) {
      if (String(k).trim() === s) return val;
    }
    return v;
  };
  const normalizedDateDim = String(agg?.dateDimension ?? "").trim().toLowerCase();
  const normalizedXKey = String(xKey ?? "").trim().toLowerCase();
  const configuredGranularity = (agg?.dateGroupByGranularity as DateGranularity | undefined) ?? undefined;
  const shouldTreatXAsDate =
    !!configuredGranularity ||
    (normalizedDateDim !== "" && normalizedDateDim === normalizedXKey) ||
    dataArray.some((r) => parseDateLike((r as Record<string, unknown>)[xKey]) != null);
  const formatXLabel = (value: unknown): string => {
    const raw = String(value ?? "");
    const overridden = labelOverride(raw);
    if (overridden !== raw) return overridden;
    if (!shouldTreatXAsDate) return overridden;
    const granularity = configuredGranularity ?? "day";
    const formatted = formatDateByGranularity(value, granularity, overridden);
    return formatted ?? overridden;
  };

  const basePalette = widget.color ? [widget.color, ...DEFAULT_PALETTE] : accentColor ? [accentColor, ...DEFAULT_PALETTE] : DEFAULT_PALETTE;
  const cfgSeriesColors = agg?.chartSeriesColors as Record<string, string> | undefined;
  const colorKeys = cfgSeriesColors ? Object.keys(cfgSeriesColors) : [];
  const aliasForYKey = (yKey: string): string => {
    const match = yKey.match(/^metric_(\d+)$/);
    if (match && agg?.metrics?.[Number(match[1])]) {
      return agg.metrics[Number(match[1])].alias || yKey;
    }
    return yKey;
  };
  const resolveColor = (key: string): string | undefined => {
    if (!cfgSeriesColors) return undefined;
    const k = (key ?? "").trim();
    return cfgSeriesColors[key] ?? cfgSeriesColors[k] ?? (key.match(/^metric_\d+$/) ? (cfgSeriesColors[aliasForYKey(key)] as string) : undefined);
  };
  const getColor = (label: string, idx: number): string => {
    const c =
      resolveColor(label) ??
      resolveColor(aliasForYKey(label)) ??
      (colorKeys[idx] != null ? cfgSeriesColors?.[colorKeys[idx]!] : undefined);
    return c ?? basePalette[idx % basePalette.length]!;
  };
  const getColorStable = (label: string): string => {
    const c = resolveColor(label) ?? resolveColor(aliasForYKey(label));
    if (c) return c;
    let hash = 0;
    for (let i = 0; i < String(label).length; i++) hash = (hash << 5) - hash + String(label).charCodeAt(i);
    return basePalette[Math.abs(hash) % basePalette.length]!;
  };

  let rows = [...dataArray];
  const resolvedType = (agg?.chartType as string) || widget.type;

  // Ranking: top N por métrica (resolver metric_N a yKeys[N] cuando la API devuelve alias)
  const isTemporalXAxis = shouldApplyTemporalRankingRule(dataArray, xKey, agg);
  const shouldApplyRanking = !!agg?.chartRankingEnabled && (agg?.chartRankingTop ?? 0) > 0 && !isTemporalXAxis;
  if (shouldApplyRanking) {
    let rKey = yKeys[0] || resultKeys[0];
    if (agg?.chartRankingMetric) {
      if (resultKeys.includes(agg.chartRankingMetric as string)) {
        rKey = agg.chartRankingMetric as string;
      } else {
        const metricMatch = (agg.chartRankingMetric as string).match(/^metric_(\d+)$/);
        if (metricMatch) {
          const idx = parseInt(metricMatch[1]!, 10);
          const resolved = yKeys[idx];
          if (resolved != null && resultKeys.includes(resolved)) rKey = resolved;
        }
      }
    }
    if (rKey) {
      rows.sort((a, b) => Number((b as Record<string, unknown>)[rKey] ?? 0) - Number((a as Record<string, unknown>)[rKey] ?? 0));
      rows = rows.slice(0, agg.chartRankingTop as number);
    }
  } else if (agg?.chartSortDirection && agg.chartSortDirection !== "none") {
    // Ordenación explícita (chartSortBy, chartSortByMetric, chartSortDirection, chartAxisOrder)
    const sortByDimension = (agg.chartSortBy as string) === "dimension" || (agg.chartSortBy as string) === "axis";
    let sortField = yKeys[0] || xKey;
    if (!sortByDimension && agg?.chartSortByMetric) {
      if (resultKeys.includes(agg.chartSortByMetric as string)) {
        sortField = agg.chartSortByMetric as string;
      } else {
        const metricMatch = (agg.chartSortByMetric as string).match(/^metric_(\d+)$/);
        if (metricMatch) {
          const idx = parseInt(metricMatch[1]!, 10);
          const resolved = yKeys[idx];
          if (resolved != null && resultKeys.includes(resolved)) sortField = resolved;
        }
      }
    } else if (sortByDimension) {
      sortField = xKey;
    }
    const dir = (agg.chartSortDirection as string) === "asc" ? 1 : -1;
    const axisOrder = agg.chartAxisOrder as string | undefined;
    rows.sort((a, b) => {
      if (sortField === xKey && axisOrder && ["alpha", "date_asc", "date_desc"].includes(axisOrder)) {
        const va = (a as Record<string, unknown>)[xKey];
        const vb = (b as Record<string, unknown>)[xKey];
        if (axisOrder === "date_asc" || axisOrder === "date_desc") {
          const ta = typeof va === "string" || typeof va === "number" ? new Date(va as string | number).getTime() : 0;
          const tb = typeof vb === "string" || typeof vb === "number" ? new Date(vb as string | number).getTime() : 0;
          return axisOrder === "date_asc" ? ta - tb : tb - ta;
        }
        const sa = String(va ?? "");
        const sb = String(vb ?? "");
        return axisOrder === "alpha" ? sa.localeCompare(sb, undefined, { numeric: true }) : sb.localeCompare(sa, undefined, { numeric: true });
      }
      const va = Number((a as Record<string, unknown>)[sortField] ?? 0);
      const vb = Number((b as Record<string, unknown>)[sortField] ?? 0);
      return isNaN(va) || isNaN(vb)
        ? String((a as Record<string, unknown>)[sortField] ?? "").localeCompare(String((b as Record<string, unknown>)[sortField] ?? "")) * dir
        : (va - vb) * dir;
    });
  }

  const isPieOrDoughnut = resolvedType === "pie" || resolvedType === "doughnut";
  const seriesField = agg?.chartSeriesField as string | undefined;

  if (resolvedType === "kpi") {
    const valueField = yKeys[0];
    const sum = rows.reduce((acc, row) => acc + Number((row as Record<string, unknown>)[valueField] ?? 0), 0);
    return { labels: ["Total"], datasets: [{ label: aliasForYKey(valueField), data: [sum] }] };
  }

  if (seriesField && resultKeys.includes(seriesField) && !isPieOrDoughnut) {
    const uniqueX = [...new Set(rows.map((r) => String((r as Record<string, unknown>)[xKey] ?? "")))];
    const seriesValues = [...new Set(rows.map((r) => String((r as Record<string, unknown>)[seriesField] ?? "")))];
    return {
      labels: uniqueX.map((value) => formatXLabel(value)),
      datasets: seriesValues.map((sv, idx) => ({
        label: labelOverride(sv),
        data: uniqueX.map((xv) => {
          const match = rows.find(
            (r) =>
              String((r as Record<string, unknown>)[xKey] ?? "") === xv &&
              String((r as Record<string, unknown>)[seriesField] ?? "") === sv
          );
          return match ? Number((match as Record<string, unknown>)[yKeys[0]!] ?? 0) : 0;
        }),
        backgroundColor: getColor(sv, idx) + "99",
        borderColor: getColor(sv, idx),
        borderWidth: 2,
      })),
    };
  }

  if (isPieOrDoughnut) {
    const labels = rows.map((r) => formatXLabel((r as Record<string, unknown>)[xKey]));
    const firstYKey = yKeys[0] || resultKeys.find((k) => k !== xKey) || resultKeys[0];
    return {
      labels,
      datasets: [
        {
          label: aliasForYKey(firstYKey!),
          data: rows.map((r) => Number((r as Record<string, unknown>)[firstYKey!] ?? 0)),
          backgroundColor: labels.map((l) => getColorStable(l)),
          borderColor: "#fff",
          borderWidth: 2,
        },
      ],
    };
  }

  if (resolvedType === "combo" && yKeys.length >= 2) {
    const labels = rows.map((r) => formatXLabel((r as Record<string, unknown>)[xKey]));
    const label0 = aliasForYKey(yKeys[0]!);
    const label1 = aliasForYKey(yKeys[1]!);
    return {
      labels,
      datasets: [
        {
          label: label0,
          data: rows.map((r) => Number((r as Record<string, unknown>)[yKeys[0]!] ?? 0)),
          backgroundColor: getColor(label0, 0) + "80",
          borderColor: getColor(label0, 0),
          borderWidth: 2,
          type: "bar",
          yAxisID: "y",
        },
        {
          label: label1,
          data: rows.map((r) => Number((r as Record<string, unknown>)[yKeys[1]!] ?? 0)),
          backgroundColor: getColor(label1, 1) + "20",
          borderColor: getColor(label1, 1),
          borderWidth: 2,
          type: "line",
          fill: false,
          yAxisID: "y1",
        },
      ],
    };
  }

  const labels = rows.map((r) => formatXLabel((r as Record<string, unknown>)[xKey]));
  const isBarOrHorizontalBar = resolvedType === "bar" || resolvedType === "horizontalBar";
  const oneMetricManyCategories = isBarOrHorizontalBar && yKeys.length === 1 && labels.length > 0;
  if (oneMetricManyCategories) {
    const yKey = yKeys[0]!;
    const displayLabel = aliasForYKey(yKey);
    const barColors = labels.map((l) => getColorStable(l));
    return {
      labels,
      datasets: [
        {
          label: displayLabel,
          data: rows.map((r) => Number((r as Record<string, unknown>)[yKey] ?? 0)),
          backgroundColor: barColors.map((c) => c + "99"),
          borderColor: barColors,
          borderWidth: 2,
        },
      ],
    };
  }
  return {
    labels,
    datasets: yKeys.map((yKey, idx) => {
      const displayLabel = aliasForYKey(yKey);
      return {
        label: displayLabel,
        data: rows.map((r) => Number((r as Record<string, unknown>)[yKey] ?? 0)),
        backgroundColor: (resolvedType === "area" ? getColor(displayLabel, idx) + "40" : getColor(displayLabel, idx) + "99"),
        borderColor: getColor(displayLabel, idx),
        borderWidth: resolvedType === "line" || resolvedType === "area" ? 2 : 1,
        ...(resolvedType === "area" ? { fill: true } : {}),
      };
    }),
  };
}
