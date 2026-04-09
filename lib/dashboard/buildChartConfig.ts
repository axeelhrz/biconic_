/**
 * Construcción unificada de ChartConfig para dashboards.
 * Usado tanto en el editor (AdminDashboardStudio) como en la vista final (DashboardViewer)
 * para que la visualización sea idéntica en ambos contextos.
 */

import {
  formatAnalysisDateForChart,
  formatDateByGranularity,
  parseDateLike,
  type AnalysisDateDisplayFormat,
  type DateGranularity,
  type ParseDateLikeOptions,
} from "@/lib/dashboard/dateFormatting";

function aggregationDateParseOpts(agg?: { dateSlashOrder?: string }): ParseDateLikeOptions {
  return { slashDateOrder: agg?.dateSlashOrder === "MDY" ? "MDY" : "DMY" };
}

export type ChartConfig = {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    hoverBackgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    maxBarThickness?: number;
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
    /** Texto en leyenda por clave de métrica (misma clave que chartYAxes / columna en filas). */
    chartDatasetLabelOverrides?: Record<string, string>;
    tableColumnLabelOverrides?: Record<string, string>;
    chartRankingEnabled?: boolean;
    chartRankingTop?: number;
    chartRankingMetric?: string;
    chartRankingDirection?: "asc" | "desc";
    chartSortDirection?: string;
    chartSortBy?: string;
    chartSortByMetric?: string;
    chartAxisOrder?: string;
    /** DMY = día/mes (default); MDY = mes/día (US) para barras ambiguas `4/1/2024`. */
    dateSlashOrder?: "DMY" | "MDY";
    ratioReuseMode?: boolean;
    chartBarThickness?: number;
    chartLineBorderWidth?: number;
    chartGridLineWidth?: number;
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

type AggMetricLike = { alias?: string; func?: string; field?: string };

/** Igual que `metricAliases` y `externalKey` en aggregate-data: `alias` o `func(campo)`. */
function metricExternalColumnKey(m: AggMetricLike | undefined): string {
  if (!m) return "";
  const raw = m.alias || `${m.func}(${m.field})`;
  return String(raw ?? "").trim();
}

function normalizeLooseKey(s: string): string {
  return s.toLowerCase().replace(/[\s-]+/g, "_").replace(/_+/g, "_");
}

/**
 * Alinea un alias de chartYAxes con la clave real en las filas (API puede devolver otro casing,
 * guiones bajos vs espacios, etc.). Sin esto solo se grafica la primera métrica que hace match exacto.
 */
function matchResultKey(candidate: string, resultKeys: string[]): string | null {
  const t = String(candidate ?? "").trim();
  if (!t) return null;
  if (resultKeys.includes(t)) return t;
  const tl = t.toLowerCase();
  for (const k of resultKeys) {
    if (k.toLowerCase() === tl) return k;
  }
  const nt = normalizeLooseKey(t);
  for (const k of resultKeys) {
    if (normalizeLooseKey(k) === nt) return k;
  }
  return null;
}

/**
 * Convierte una entrada de chartYAxes (alias, metric_N, etc.) a la clave presente en las filas.
 */
function resolveChartYAxisEntryToResultKey(
  trimmed: string,
  metrics: AggMetricLike[] | undefined,
  resultKeys: string[]
): string | null {
  if (!trimmed) return null;
  const match = /^metric_(\d+)$/i.exec(trimmed);
  if (match && Array.isArray(metrics) && metrics.length > 0) {
    const idx = parseInt(match[1]!, 10);
    if (Number.isFinite(idx) && idx >= 0 && idx < metrics.length) {
      const ext = metricExternalColumnKey(metrics[idx]);
      if (ext) {
        const hit = matchResultKey(ext, resultKeys);
        if (hit) return hit;
      }
    }
    return matchResultKey(trimmed, resultKeys);
  }
  const direct = matchResultKey(trimmed, resultKeys);
  if (direct) return direct;
  if (Array.isArray(metrics)) {
    for (const m of metrics) {
      const ext = metricExternalColumnKey(m);
      if (!ext) continue;
      if (
        ext.toLowerCase() === trimmed.toLowerCase() ||
        normalizeLooseKey(ext) === normalizeLooseKey(trimmed)
      ) {
        const hit = matchResultKey(ext, resultKeys);
        if (hit) return hit;
      }
    }
  }
  return null;
}

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
  const resolvedType = String(agg?.chartType ?? widget.type ?? "").trim();
  const isHorizontalBar = resolvedType === "horizontalBar";
  const chartXAxisRaw =
    typeof agg?.chartXAxis === "string" ? String(agg.chartXAxis).trim() : "";
  const chartXAxisKey = chartXAxisRaw
    ? matchResultKey(chartXAxisRaw, resultKeys) ?? undefined
    : undefined;
  const explicitDimensionCandidates = [
    agg?.dimension,
    ...(Array.isArray(agg?.dimensions) ? agg.dimensions : []),
    agg?.dimension2,
    widget.source?.labelField,
  ]
    .map((k) => String(k ?? "").trim())
    .filter(Boolean);
  const explicitDimensionKey =
    explicitDimensionCandidates
      .map((k) => matchResultKey(k, resultKeys))
      .find((k) => k != null) ?? undefined;
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
  const metricsForY = (agg?.metrics ?? []) as AggMetricLike[];
  if (hasExplicitYAxes) {
    const ordered: string[] = [];
    const seenY = new Set<string>();
    for (const raw of agg!.chartYAxes!) {
      const trimmed = String(raw ?? "").trim();
      const resolved = resolveChartYAxisEntryToResultKey(trimmed, metricsForY, resultKeys);
      if (resolved != null && !seenY.has(resolved)) {
        seenY.add(resolved);
        ordered.push(resolved);
      }
    }
    yKeys = ordered;
  }
  if (!hasExplicitYAxes && yKeys.length === 0 && formulaMetricAliases.length > 0) {
    yKeys = formulaMetricAliases
      .map((k) => matchResultKey(k, resultKeys))
      .filter((k): k is string => k != null);
  }
  if (!hasExplicitYAxes && yKeys.length === 0 && metricAliases.length > 0) {
    const seen = new Set<string>();
    yKeys = metricAliases
      .map((k) => matchResultKey(k, resultKeys))
      .filter((k): k is string => k != null)
      .filter((k) => {
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }
  if (!hasExplicitYAxes && yKeys.length === 0) {
    const numKeys = resultKeys.filter((k) => typeof (sample as Record<string, unknown>)[k] === "number");
    yKeys = numKeys.length > 0 ? numKeys : resultKeys.filter((k) => k !== xKey).slice(0, 1);
  }
  yKeys = yKeys.filter((k) => k !== xKey);
  if (isHorizontalBar && (!xKey || metricAliases.includes(xKey))) return null;
  if (!xKey || yKeys.length === 0) return null;
  return { sample, resultKeys, metricAliases, xKey, yKeys };
}

function shouldApplyTemporalRankingRule(
  _rows: Record<string, unknown>[],
  xKey: string,
  agg?: BuildChartConfigWidget["aggregationConfig"]
): boolean {
  /** Si el usuario activó Top N explícitamente, no bloquear el ranking por eje “temporal” (ej. top fechas por métrica). */
  if (agg?.chartRankingEnabled) return false;
  const normalizedDateDim = String(agg?.dateDimension ?? "").trim().toLowerCase();
  const normalizedXKey = String(xKey ?? "").trim().toLowerCase();
  /** Solo configuración explícita: evita desactivar Top N por heurística de parseo en categorías mixtas. */
  return (
    !!agg?.dateGroupByGranularity ||
    (normalizedDateDim !== "" && normalizedDateDim === normalizedXKey)
  );
}

function compareRowsByRankingMetric(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  rKey: string,
  direction: string | undefined
): number {
  const va = Number(a[rKey] ?? 0);
  const vb = Number(b[rKey] ?? 0);
  if (String(direction ?? "desc").toLowerCase() === "asc") return va - vb;
  return vb - va;
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
  const dateParseOpts = aggregationDateParseOpts(agg);
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
      rows.sort((a, b) =>
        compareRowsByRankingMetric(
          a as Record<string, unknown>,
          b as Record<string, unknown>,
          rKey,
          agg?.chartRankingDirection
        )
      );
      rows = rows.slice(0, agg.chartRankingTop as number);
    }
  } else if (
    !shouldApplyRanking &&
    isTemporalXAxis &&
    (agg?.chartAxisOrder === "date_asc" || agg?.chartAxisOrder === "date_desc") &&
    (!agg?.chartSortDirection || agg.chartSortDirection === "none")
  ) {
    const axisOrder = agg.chartAxisOrder as string;
    rows.sort((a, b) => {
      const va = (a as Record<string, unknown>)[xKey];
      const vb = (b as Record<string, unknown>)[xKey];
      const ta =
        parseDateLike(va, dateParseOpts)?.getTime() ??
        (typeof va === "string" || typeof va === "number" ? new Date(va as string | number).getTime() : NaN);
      const tb =
        parseDateLike(vb, dateParseOpts)?.getTime() ??
        (typeof vb === "string" || typeof vb === "number" ? new Date(vb as string | number).getTime() : NaN);
      if (!Number.isNaN(ta) && !Number.isNaN(tb)) {
        const dirDate = axisOrder === "date_desc" ? -1 : 1;
        return (ta - tb) * dirDate;
      }
      return String(va ?? "").localeCompare(String(vb ?? ""), undefined, { numeric: true });
    });
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
          const ta =
            parseDateLike(va, dateParseOpts)?.getTime() ??
            (typeof va === "string" || typeof va === "number" ? new Date(va as string | number).getTime() : NaN);
          const tb =
            parseDateLike(vb, dateParseOpts)?.getTime() ??
            (typeof vb === "string" || typeof vb === "number" ? new Date(vb as string | number).getTime() : NaN);
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

/** Borde entre porciones pie/dona: tono más oscuro que el relleno para separar sin blanco fijo. */
function pieSliceBorderColorsFromBackgrounds(backgrounds: string[]): string[] {
  return backgrounds.map((c) => {
    let hex = String(c ?? "").trim();
    if (hex.startsWith("#")) hex = hex.slice(1);
    if (hex.length !== 6 || !/^[0-9a-f]+$/i.test(hex)) return "rgba(15, 23, 42, 0.35)";
    const n = parseInt(hex, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const f = 0.72;
    return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
  });
}

function resolvePieSliceBorderWidth(agg: BuildChartConfigWidget["aggregationConfig"]): number {
  const raw = (agg as { pieSliceBorderWidth?: unknown } | undefined)?.pieSliceBorderWidth;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(8, Math.round(raw)));
}

function resolveChartMaxBarThickness(agg: BuildChartConfigWidget["aggregationConfig"] | undefined): number | undefined {
  const raw = agg?.chartBarThickness;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.max(4, Math.min(120, Math.round(raw)));
}

function resolveChartLineBorderWidth(agg: BuildChartConfigWidget["aggregationConfig"] | undefined): number {
  const raw = agg?.chartLineBorderWidth;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 2;
  return Math.max(0, Math.min(16, raw));
}

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
    const metricsKpi = (agg?.metrics ?? []) as AggMetricLike[];
    const rawKpiY =
      Array.isArray(agg?.chartYAxes) && agg.chartYAxes[0] != null ? String(agg.chartYAxes[0]).trim() : "";
    const resolvedKpiY = rawKpiY ? resolveChartYAxisEntryToResultKey(rawKpiY, metricsKpi, resultKeys) : null;
    const yKey =
      resolvedKpiY ??
      metricAliases.find((k) => resultKeys.includes(k))
      ?? resultKeys.find((k) => typeof sample[k] === "number")
      ?? resultKeys[0];
    if (!yKey) return undefined;
    const dsKpi = agg?.chartDatasetLabelOverrides as Record<string, string> | undefined;
    const kpiMatch = yKey.match(/^metric_(\d+)$/);
    const kpiDefaultLabel =
      kpiMatch && metricsKpi[Number(kpiMatch[1])]
        ? String(metricsKpi[Number(kpiMatch[1])].alias ?? "").trim() || yKey
        : yKey;
    const kpiLegend =
      typeof dsKpi?.[yKey] === "string" && dsKpi[yKey]!.trim() !== "" ? dsKpi[yKey]!.trim() : kpiDefaultLabel;
    const sum = dataArray.reduce((acc, row) => acc + Number((row as Record<string, unknown>)[yKey] ?? 0), 0);
    return { labels: ["Total"], datasets: [{ label: kpiLegend, data: [sum] }] };
  }

  const axis = resolveWidgetAxisKeys(dataArray, widget);
  if (!axis) return undefined;
  const { xKey, yKeys, resultKeys } = axis;
  const dateParseOpts = aggregationDateParseOpts(agg);

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
    dataArray.some((r) => parseDateLike((r as Record<string, unknown>)[xKey], dateParseOpts) != null);
  const dateDisplayFmt = agg?.analysisDateDisplayFormat as AnalysisDateDisplayFormat | undefined;
  const formatXLabel = (value: unknown): string => {
    const raw = String(value ?? "");
    const overridden = labelOverride(raw);
    if (overridden !== raw) return overridden;
    if (!shouldTreatXAsDate) return overridden;
    const granularity = configuredGranularity ?? "day";
    const formatted = formatAnalysisDateForChart(value, granularity, dateDisplayFmt, overridden, dateParseOpts);
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
  const datasetLabelOverrides = (agg?.chartDatasetLabelOverrides as Record<string, string> | undefined) ?? undefined;
  const datasetDisplayLabel = (yKey: string): string => {
    const o = datasetLabelOverrides?.[yKey];
    if (typeof o === "string" && o.trim() !== "") return o.trim();
    return aliasForYKey(yKey);
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
  const maxBarThicknessPx = resolveChartMaxBarThickness(agg);
  const barThicknessOpts = maxBarThicknessPx != null ? { maxBarThickness: maxBarThicknessPx } : {};
  const lineStrokeW = resolveChartLineBorderWidth(agg);

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
      rows.sort((a, b) =>
        compareRowsByRankingMetric(
          a as Record<string, unknown>,
          b as Record<string, unknown>,
          rKey,
          agg?.chartRankingDirection
        )
      );
      rows = rows.slice(0, agg.chartRankingTop as number);
    }
  } else if (
    !shouldApplyRanking &&
    isTemporalXAxis &&
    (agg?.chartAxisOrder === "date_asc" || agg?.chartAxisOrder === "date_desc") &&
    (!agg?.chartSortDirection || agg.chartSortDirection === "none")
  ) {
    const axisOrder = agg.chartAxisOrder as string;
    rows.sort((a, b) => {
      const va = (a as Record<string, unknown>)[xKey];
      const vb = (b as Record<string, unknown>)[xKey];
      const ta =
        parseDateLike(va, dateParseOpts)?.getTime() ??
        (typeof va === "string" || typeof va === "number" ? new Date(va as string | number).getTime() : NaN);
      const tb =
        parseDateLike(vb, dateParseOpts)?.getTime() ??
        (typeof vb === "string" || typeof vb === "number" ? new Date(vb as string | number).getTime() : NaN);
      if (!Number.isNaN(ta) && !Number.isNaN(tb)) {
        const dirDate = axisOrder === "date_desc" ? -1 : 1;
        return (ta - tb) * dirDate;
      }
      return String(va ?? "").localeCompare(String(vb ?? ""), undefined, { numeric: true });
    });
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
          const ta =
            parseDateLike(va, dateParseOpts)?.getTime() ??
            (typeof va === "string" || typeof va === "number" ? new Date(va as string | number).getTime() : NaN);
          const tb =
            parseDateLike(vb, dateParseOpts)?.getTime() ??
            (typeof vb === "string" || typeof vb === "number" ? new Date(vb as string | number).getTime() : NaN);
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
    (resolvedType === "bar" ||
      resolvedType === "horizontalBar" ||
      resolvedType === "combo" ||
      resolvedType === "stackedColumn") &&
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
      ...barThicknessOpts,
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
      const secondaryLabel = datasetDisplayLabel(secondaryMetricKey);
      return {
        labels: uniqueX.map((value) => formatXLabel(value)),
        datasets: [
          ...segmentDatasets,
          {
            label: secondaryLabel,
            data: uniqueX.map((xv) => sumByXSecondary.get(xv) ?? 0),
            backgroundColor: getColor(secondaryMetricKey, seriesValues.length) + "20",
            borderColor: getColor(secondaryMetricKey, seriesValues.length),
            borderWidth: lineStrokeW,
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
    const sliceBw = resolvePieSliceBorderWidth(agg);
    const bgColors = labels.map((l) => getColorStable(l));
    return {
      labels,
      datasets: [
        {
          label: datasetDisplayLabel(firstYKey!),
          data: rows.map((r) => Number((r as Record<string, unknown>)[firstYKey!] ?? 0)),
          backgroundColor: bgColors,
          borderColor: sliceBw > 0 ? pieSliceBorderColorsFromBackgrounds(bgColors) : bgColors,
          borderWidth: sliceBw,
        },
      ],
    };
  }

  if (resolvedType === "combo" && yKeys.length >= 2) {
    const labels = rows.map((r) => formatXLabel((r as Record<string, unknown>)[xKey]));
    const y0 = yKeys[0]!;
    const y1 = yKeys[1]!;
    const label0 = datasetDisplayLabel(y0);
    const label1 = datasetDisplayLabel(y1);
    return {
      labels,
      datasets: [
        {
          label: label0,
          data: rows.map((r) => Number((r as Record<string, unknown>)[y0] ?? 0)),
          backgroundColor: getColor(y0, 0) + "80",
          borderColor: getColor(y0, 0),
          borderWidth: 2,
          type: "bar",
          yAxisID: "y",
          ...barThicknessOpts,
        },
        {
          label: label1,
          data: rows.map((r) => Number((r as Record<string, unknown>)[y1] ?? 0)),
          backgroundColor: getColor(y1, 1) + "20",
          borderColor: getColor(y1, 1),
          borderWidth: lineStrokeW,
          type: "line",
          fill: false,
          yAxisID: "y1",
        },
      ],
    };
  }

  const labels = rows.map((r) => formatXLabel((r as Record<string, unknown>)[xKey]));
  const isBarOrHorizontalBar =
    resolvedType === "bar" || resolvedType === "horizontalBar" || resolvedType === "stackedColumn";
  const oneMetricManyCategories = isBarOrHorizontalBar && yKeys.length === 1 && labels.length > 0;
  if (oneMetricManyCategories) {
    const yKey = yKeys[0]!;
    const displayLabel = datasetDisplayLabel(yKey);
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
          ...barThicknessOpts,
        },
      ],
    };
  }
  return {
    labels,
    datasets: yKeys.map((yKey, idx) => {
      const displayLabel = datasetDisplayLabel(yKey);
      const isLineLike = resolvedType === "line" || resolvedType === "area";
      const isBarLike =
        resolvedType === "bar" || resolvedType === "horizontalBar" || resolvedType === "stackedColumn";
      return {
        label: displayLabel,
        data: rows.map((r) => Number((r as Record<string, unknown>)[yKey] ?? 0)),
        backgroundColor: (resolvedType === "area" ? getColor(yKey, idx) + "40" : getColor(yKey, idx) + "99"),
        borderColor: getColor(yKey, idx),
        borderWidth: isLineLike ? lineStrokeW : 1,
        ...(isBarLike ? barThicknessOpts : {}),
        ...(resolvedType === "area" ? { fill: true } : {}),
      };
    }),
  };
}
