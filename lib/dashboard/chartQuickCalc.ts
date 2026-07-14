import type { ChartConfig, BuildChartConfigWidget } from "@/lib/dashboard/buildChartConfig";
import { createChartPercentDenominatorResolver } from "@/lib/dashboard/chartPercentEngine";
import { chartQuickCalcToPercentBasis, normalizeChartQuickCalc, type ChartQuickCalc } from "@/lib/dashboard/chartQuickCalcTypes";
import { sumFiniteNumbers } from "@/lib/dashboard/chartOptions";

export { CHART_QUICK_CALC_OPTIONS, chartQuickCalcToPercentBasis, chartQuickCalcUsesPercentDisplay, normalizeChartQuickCalc } from "@/lib/dashboard/chartQuickCalcTypes";
export type { ChartQuickCalc } from "@/lib/dashboard/chartQuickCalcTypes";

function finiteNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function allChartValues(config: ChartConfig): number[] {
  const out: number[] = [];
  for (const ds of config.datasets ?? []) {
    if (!Array.isArray(ds.data)) continue;
    for (const v of ds.data) {
      const n = finiteNum(v);
      if (n != null) out.push(n);
    }
  }
  return out;
}

function transformPoint(
  value: number,
  mode: ChartQuickCalc,
  di: number,
  dsi: number,
  config: ChartConfig,
  resolveDenom: (di: number, dsi: number) => number | undefined
): number {
  switch (mode) {
    case "none":
      return value;
    case "percent_total":
    case "percent_category":
    case "percent_series":
    case "percent_dimension": {
      const denom = resolveDenom(di, dsi);
      if (denom == null || denom === 0) return 0;
      return (value / denom) * 100;
    }
    case "vs_average": {
      const vals = allChartValues(config);
      if (vals.length === 0) return 0;
      const avg = sumFiniteNumbers(vals) / vals.length;
      if (avg === 0) return 0;
      return (value / avg) * 100;
    }
    case "vs_max": {
      const vals = allChartValues(config);
      if (vals.length === 0) return 0;
      const max = Math.max(...vals);
      if (max === 0) return 0;
      return (value / max) * 100;
    }
    case "vs_min": {
      const vals = allChartValues(config);
      if (vals.length === 0) return 0;
      const min = Math.min(...vals);
      if (min === 0) return 0;
      return (value / min) * 100;
    }
    default:
      return value;
  }
}

/** Aplica cálculo rápido a datasets del gráfico (altura de barras, ejes, etiquetas). */
export function applyChartQuickCalc(
  config: ChartConfig | undefined,
  widget: BuildChartConfigWidget,
  rows: Record<string, unknown>[],
  accentColor = ""
): ChartConfig | undefined {
  if (!config) return undefined;
  const mode = normalizeChartQuickCalc((widget.aggregationConfig as { chartQuickCalc?: unknown } | undefined)?.chartQuickCalc);
  if (mode === "none") return config;

  const percentBasis = chartQuickCalcToPercentBasis(mode);
  const resolveDenom =
    percentBasis != null
      ? createChartPercentDenominatorResolver({
          basisRaw: percentBasis,
          fullRows: rows,
          widget: {
            ...widget,
            chartPercentGroupField:
              (widget.aggregationConfig as { chartPercentGroupField?: string } | undefined)?.chartPercentGroupField ??
              (widget as { chartPercentGroupField?: string }).chartPercentGroupField,
          },
          chartConfig: config,
          accentColor,
        })
      : () => undefined;

  const datasets = (config.datasets ?? []).map((ds, dsi) => {
    const data = (ds.data ?? []).map((raw, di) => {
      const v = finiteNum(raw);
      if (v == null) return raw;
      return transformPoint(v, mode, di, dsi, config, resolveDenom);
    });
    return { ...ds, data };
  });

  return { ...config, datasets };
}

/** Aplica cálculo rápido a celdas numéricas de tabla. */
export function applyTableQuickCalc(
  rows: Record<string, unknown>[],
  columns: string[],
  widget: BuildChartConfigWidget,
  valueFields: string[]
): Record<string, unknown>[] {
  const mode = normalizeChartQuickCalc((widget.aggregationConfig as { chartQuickCalc?: unknown } | undefined)?.chartQuickCalc);
  if (mode === "none" || valueFields.length === 0) return rows;

  const numericCols = columns.filter((c) => valueFields.includes(c));
  if (numericCols.length === 0) return rows;

  const allVals: number[] = [];
  for (const row of rows) {
    for (const col of numericCols) {
      const n = finiteNum(row[col]);
      if (n != null) allVals.push(n);
    }
  }

  const total = sumFiniteNumbers(allVals);
  const avg = allVals.length > 0 ? total / allVals.length : 0;
  const max = allVals.length > 0 ? Math.max(...allVals) : 0;
  const min = allVals.length > 0 ? Math.min(...allVals) : 0;

  const rowTotals = rows.map((row) => {
    let s = 0;
    for (const col of numericCols) {
      const n = finiteNum(row[col]);
      if (n != null) s += n;
    }
    return s;
  });

  return rows.map((row, ri) => {
    const out = { ...row };
    const rowTotal = rowTotals[ri] ?? 0;
    for (const col of numericCols) {
      const v = finiteNum(row[col]);
      if (v == null) continue;
      let next = v;
      switch (mode) {
        case "percent_total":
          next = total !== 0 ? (v / total) * 100 : 0;
          break;
        case "percent_category":
        case "percent_series":
        case "percent_dimension":
          next = rowTotal !== 0 ? (v / rowTotal) * 100 : 0;
          break;
        case "vs_average":
          next = avg !== 0 ? (v / avg) * 100 : 0;
          break;
        case "vs_max":
          next = max !== 0 ? (v / max) * 100 : 0;
          break;
        case "vs_min":
          next = min !== 0 ? (v / min) * 100 : 0;
          break;
        default:
          break;
      }
      out[col] = next;
    }
    return out;
  });
}

/** KPI: un solo valor transformado. */
export function applyScalarQuickCalc(value: number, mode: ChartQuickCalc): number {
  if (mode === "none") return value;
  if (mode === "percent_total" || mode === "percent_category" || mode === "percent_series" || mode === "percent_dimension") {
    return 100;
  }
  if (mode === "vs_average" || mode === "vs_max" || mode === "vs_min") {
    return 100;
  }
  return value;
}
