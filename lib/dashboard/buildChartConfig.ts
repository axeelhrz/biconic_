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
    chartStackBySeries?: boolean;
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
    ratioReuseMode?: boolean;
    [key: string]: unknown;
  };
  source?: { labelField?: string };
  color?: string;
};

export type ResolvedWidgetAxisKeys = {
  sample: Record<string, unknown>;
  resultKeys: string[];
  metricAliases: string[];
  xKey: string;
  yKeys: string[];
};

/**
 * Resuelve las claves de eje (X/Y) desde la configuración del widget y las columnas reales devueltas.
 * Es la fuente de verdad compartida para renderer y generación de chart config.
 */
export function resolveWidgetAxisKeys(
  dataArray: Record<string, unknown>[],
  widget: BuildChartConfigWidget
): ResolvedWidgetAxisKeys | null {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return null;
  const sample = dataArray[0] || {};
  const resultKeys = Object.keys(sample);
  const agg = widget.aggregationConfig;
  const metricAliases =
    agg?.enabled && agg.metrics?.length
      ? agg.metrics.map((m) => m.alias || `${m.func}(${m.field})`).filter(Boolean)
      : [];
  const formulaMetricAliases =
    agg?.enabled && agg.metrics?.length
      ? agg.metrics
          .filter((m) => String(m?.func ?? "").trim().toUpperCase() === "FORMULA")
          .map((m) => String(m.alias ?? "").trim())
          .filter(Boolean)
      : [];
  const formulaMetricAliasSet = new Set(formulaMetricAliases);
  const resolvedType = String(agg?.chartType ?? widget.type ?? "").trim();
  const isHorizontalBar = resolvedType === "horizontalBar";
  const chartXAxisKey =
    typeof agg?.chartXAxis === "string" && resultKeys.includes(agg.chartXAxis)
      ? agg.chartXAxis
      : undefined;
  const explicitDimensionCandidates = [
    agg?.dimension,
    ...(Array.isArray(agg?.dimensions) ? agg.dimensions : []),
    agg?.dimension2,
    widget.source?.labelField,
  ]
    .map((k) => String(k ?? "").trim())
    .filter(Boolean);
  const explicitDimensionKey = explicitDimensionCandidates.find((k) => resultKeys.includes(k));
  const inferredDimensionKey = resultKeys.find((k) => {
    if (metricAliases.includes(k)) return false;
    const valueType = typeof (sample as Record<string, unknown>)[k];
    return valueType === "string" || valueType === "number";
  });
  const xKey = isHorizontalBar
    ? chartXAxisKey ?? explicitDimensionKey
    : chartXAxisKey ?? explicitDimensionKey ?? inferredDimensionKey ?? resultKeys[0];
  let yKeys: string[] = [];
  const hasExplicitYAxes = Array.isArray(agg?.chartYAxes) && agg.chartYAxes.length > 0;
  if (Array.isArray(agg?.chartYAxes) && agg.chartYAxes.length > 0) {
    // Prioriza ejes explícitos, pero evita entradas vacías/duplicadas.
    const explicitKeys = agg.chartYAxes
      .map((k) => String(k ?? "").trim())
      .filter((k) => k !== "" && resultKeys.includes(k));
    yKeys = Array.from(new Set(explicitKeys));
  }
  if (hasExplicitYAxes && metricAliases.length > 0 && agg?.ratioReuseMode !== true) {
    // Si chartYAxes ya define 2+ series válidas, respétalo tal cual para mantener
    // consistencia con el preview ETL y evitar añadir una tercera serie inesperada.
    if (yKeys.length === 1) {
      // Solo completar si el eje explícito quedó realmente incompleto.
      const missingMetricAliases = metricAliases
        .map((k) => String(k ?? "").trim())
        .filter(
          (k) =>
            k !== "" &&
            resultKeys.includes(k) &&
            !yKeys.includes(k) &&
            !formulaMetricAliasSet.has(k)
        );
      if (missingMetricAliases.length > 0) {
        yKeys = [...yKeys, ...missingMetricAliases];
      }
    }
  }
  if (!hasExplicitYAxes && yKeys.length === 0 && formulaMetricAliases.length > 0) {
    yKeys = formulaMetricAliases.filter((k) => resultKeys.includes(k));
  }
  if (yKeys.length === 0 && metricAliases.length > 0) {
    yKeys = metricAliases.filter((k) => resultKeys.includes(k));
  }
  if (yKeys.length === 0) {
    const numKeys = resultKeys.filter((k) => typeof (sample as Record<string, unknown>)[k] === "number");
    yKeys = numKeys.length > 0 ? numKeys : resultKeys.filter((k) => k !== xKey).slice(0, 1);
  }
  yKeys = yKeys.filter((k) => k !== xKey);
  if (isHorizontalBar && (!xKey || metricAliases.includes(xKey))) return null;
  if (!xKey || yKeys.length === 0) return null;
  return { sample, resultKeys, metricAliases, xKey, yKeys };
}

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
  const agg = widget.aggregationConfig;
  const axis = resolveWidgetAxisKeys(dataArray, widget);
  if (!axis) return [...dataArray];
  const { xKey, yKeys, resultKeys } = axis;

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
        const sortAsDate = axisOrder === "date_asc" || axisOrder === "date_desc" || (axisOrder === "alpha" && isTemporalXAxis);
        if (sortAsDate) {
          const ta = parseDateLike(va)?.getTime() ?? (typeof va === "string" || typeof va === "number" ? new Date(va as string | number).getTime() : NaN);
          const tb = parseDateLike(vb)?.getTime() ?? (typeof vb === "string" || typeof vb === "number" ? new Date(vb as string | number).getTime() : NaN);
          if (!Number.isNaN(ta) && !Number.isNaN(tb)) {
            const dirDate = axisOrder === "date_desc" ? -1 : 1;
            return (ta - tb) * dirDate;
          }
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
  const agg = widget.aggregationConfig;
  const resolvedTypeEarly = (agg?.chartType as string) || widget.type;

  if (resolvedTypeEarly === "kpi") {
    const sample = (dataArray[0] ?? {}) as Record<string, unknown>;
    const resultKeys = Object.keys(sample);
    const metricAliases =
      agg?.enabled && agg.metrics?.length
        ? agg.metrics.map((m) => m.alias || `${m.func}(${m.field})`).filter(Boolean)
        : [];
    const yKey =
      (Array.isArray(agg?.chartYAxes) && agg.chartYAxes[0] && resultKeys.includes(agg.chartYAxes[0]) ? agg.chartYAxes[0] : undefined)
      ?? metricAliases.find((k) => resultKeys.includes(k))
      ?? resultKeys.find((k) => typeof sample[k] === "number")
      ?? resultKeys[0];
    if (!yKey) return undefined;
    const sum = dataArray.reduce((acc, row) => acc + Number((row as Record<string, unknown>)[yKey] ?? 0), 0);
    return { labels: ["Total"], datasets: [{ label: yKey, data: [sum] }] };
  }

  const axis = resolveWidgetAxisKeys(dataArray, widget);
  if (!axis) return undefined;
  const { xKey, yKeys, resultKeys } = axis;

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
        const sortAsDate = axisOrder === "date_asc" || axisOrder === "date_desc" || (axisOrder === "alpha" && shouldTreatXAsDate);
        if (sortAsDate) {
          const ta = parseDateLike(va)?.getTime() ?? (typeof va === "string" || typeof va === "number" ? new Date(va as string | number).getTime() : NaN);
          const tb = parseDateLike(vb)?.getTime() ?? (typeof vb === "string" || typeof vb === "number" ? new Date(vb as string | number).getTime() : NaN);
          if (!Number.isNaN(ta) && !Number.isNaN(tb)) {
            const dirDate = axisOrder === "date_desc" ? -1 : 1;
            return (ta - tb) * dirDate;
          }
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
  const configuredSeriesField = String(agg?.chartSeriesField ?? "").trim();
  const fallbackSeriesField = String(agg?.dimension2 ?? "").trim();
  const seriesFieldCandidate = [configuredSeriesField, fallbackSeriesField]
    .find((field) => field && field !== xKey && resultKeys.includes(field));
  const seriesField = seriesFieldCandidate || undefined;
  const stackedBySeriesEnabled =
    !!seriesField &&
    (resolvedType === "bar" || resolvedType === "horizontalBar" || resolvedType === "combo") &&
    (typeof agg?.chartStackBySeries === "boolean" ? agg.chartStackBySeries : true);

  if (seriesField && resultKeys.includes(seriesField) && !isPieOrDoughnut) {
    const uniqueX = [...new Set(rows.map((r) => String((r as Record<string, unknown>)[xKey] ?? "")))];
    const seriesValues = [...new Set(rows.map((r) => String((r as Record<string, unknown>)[seriesField] ?? "")))];
    const primaryMetricKey = yKeys[0]!;
    const sumByXSeries = new Map<string, number>();
    rows.forEach((row) => {
      const rowX = String((row as Record<string, unknown>)[xKey] ?? "");
      const rowSeries = String((row as Record<string, unknown>)[seriesField] ?? "");
      const key = `${rowX}\u0001${rowSeries}`;
      const current = sumByXSeries.get(key) ?? 0;
      const next = Number((row as Record<string, unknown>)[primaryMetricKey] ?? 0);
      sumByXSeries.set(key, current + (Number.isFinite(next) ? next : 0));
    });
    const segmentDatasets = seriesValues.map((sv, idx) => ({
      label: labelOverride(sv),
      data: uniqueX.map((xv) => sumByXSeries.get(`${xv}\u0001${sv}`) ?? 0),
      backgroundColor: getColor(sv, idx) + "99",
      borderColor: getColor(sv, idx),
      borderWidth: 2,
      ...(stackedBySeriesEnabled ? { stack: "series" } : {}),
      ...(resolvedType === "combo" ? { type: "bar" as const, yAxisID: "y" as const } : {}),
    }));
    if (resolvedType === "combo" && stackedBySeriesEnabled && yKeys.length >= 2) {
      const secondaryMetricKey = yKeys[1]!;
      const sumByXSecondary = new Map<string, number>();
      rows.forEach((row) => {
        const rowX = String((row as Record<string, unknown>)[xKey] ?? "");
        const current = sumByXSecondary.get(rowX) ?? 0;
        const next = Number((row as Record<string, unknown>)[secondaryMetricKey] ?? 0);
        sumByXSecondary.set(rowX, current + (Number.isFinite(next) ? next : 0));
      });
      const secondaryLabel = aliasForYKey(secondaryMetricKey);
      return {
        labels: uniqueX.map((value) => formatXLabel(value)),
        datasets: [
          ...segmentDatasets,
          {
            label: secondaryLabel,
            data: uniqueX.map((xv) => sumByXSecondary.get(xv) ?? 0),
            backgroundColor: getColor(secondaryLabel, seriesValues.length) + "20",
            borderColor: getColor(secondaryLabel, seriesValues.length),
            borderWidth: 2,
            type: "line",
            fill: false,
            yAxisID: "y1",
          },
        ],
      };
    }
    return {
      labels: uniqueX.map((value) => formatXLabel(value)),
      datasets: segmentDatasets,
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
