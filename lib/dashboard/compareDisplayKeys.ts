import type { CompareSpec, LegacyCompareInput } from "@/lib/dashboard/compareSpec";
import { normalizeAggregationCompare } from "@/lib/dashboard/compareSpec";
import { getEffectiveDashboardCompareUi } from "@/lib/dashboard/ensureDashboardCompareUi";
import { getRowValue, resolveRowColumnKey, compareBucketSortTime } from "@/lib/dashboard/compareMetricRows";
import { formatValue, type ChartStyleConfig } from "@/lib/dashboard/chartOptions";
import { pickDateGroupBySourceField } from "@/lib/dashboard/dateGroupBySourceField";
import type { ParseDateLikeOptions } from "@/lib/dashboard/dateFormatting";

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type DashboardCompareIndicator = "none" | "icon" | "color" | "both";

/** Ubicación de la comparación en el widget (persistido en aggregationConfig). */
export type DashboardComparePlacement =
  | "kpi_below"
  | "table_extra_columns"
  | "line_reference_series"
  | "tooltip"
  | "detail_card";

export type DashboardCompareUi = {
  enabled?: boolean;
  /** Etiqueta visible (ej. "vs mes anterior"). */
  label?: string;
  showDelta?: boolean;
  showDeltaPct?: boolean;
  placement?: DashboardComparePlacement | DashboardComparePlacement[];
  indicator?: DashboardCompareIndicator;
};

export function normalizeComparePlacements(raw: DashboardCompareUi["placement"]): DashboardComparePlacement[] {
  if (raw == null) return ["kpi_below"];
  return Array.isArray(raw) ? raw : [raw];
}

export function placementEnabled(
  ui: DashboardCompareUi | undefined,
  p: DashboardComparePlacement
): boolean {
  if (!ui?.enabled) return false;
  return normalizeComparePlacements(ui.placement).includes(p);
}

/** Claves reales en la fila API (post applyCompareSpecToRows) para leer comparación de una métrica. */
export type CompareColumnKeys = {
  resolvedMetricKey: string | null;
  referenceKey: string | null;
  deltaKey: string | null;
  deltaPctKey: string | null;
  /** Valores del periodo de referencia (serie adicional en líneas). */
  referenceSeriesKey: string | null;
  /** Columnas extra sugeridas para tabla (orden estable). */
  tableExtraKeys: string[];
};

export type ComparePresentationValues = {
  current: number | null;
  reference: number | null;
  delta: number | null;
  deltaPct: number | null;
};

/** Si la comparación necesita varias filas (p. ej. serie temporal) para calcular deltas en el API. */
export function compareNeedsTimeGroupedRows(spec: CompareSpec): boolean {
  switch (spec.kind) {
    case "none":
      return false;
    case "fixed":
    case "column":
      return false;
    case "temporal":
    case "cumulative":
      return true;
    case "average":
      return spec.scope === "partition";
    case "total_share":
      return false;
    default:
      return false;
  }
}

/**
 * Resuelve sufijos de columnas según CompareSpec (alineado con compareMetricRows.ts).
 */
export function getCompareColumnKeys(
  spec: CompareSpec,
  metricAlias: string,
  row: Record<string, unknown>
): CompareColumnKeys {
  const k = resolveRowColumnKey(row, metricAlias);
  if (!k || spec.kind === "none") {
    return {
      resolvedMetricKey: k,
      referenceKey: null,
      deltaKey: null,
      deltaPctKey: null,
      referenceSeriesKey: null,
      tableExtraKeys: [],
    };
  }

  if (spec.kind === "temporal") {
    const ref = `${k}_prev`;
    const delta = `${k}_delta`;
    const dp = `${k}_delta_pct`;
    return {
      resolvedMetricKey: k,
      referenceKey: ref,
      deltaKey: delta,
      deltaPctKey: dp,
      referenceSeriesKey: ref,
      tableExtraKeys: [ref, delta, dp].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
    };
  }

  if (spec.kind === "fixed") {
    const delta = `${k}_vs_fijo`;
    const dp = `${k}_var_pct_fijo`;
    return {
      resolvedMetricKey: k,
      referenceKey: null,
      deltaKey: delta,
      deltaPctKey: dp,
      referenceSeriesKey: null,
      tableExtraKeys: [delta, dp].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
    };
  }

  if (spec.kind === "column") {
    const delta = `${k}_vs_col`;
    const dp = `${k}_delta_pct_col`;
    return {
      resolvedMetricKey: k,
      referenceKey: null,
      deltaKey: delta,
      deltaPctKey: dp,
      referenceSeriesKey: null,
      tableExtraKeys: [delta, dp].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
    };
  }

  if (spec.kind === "average") {
    const delta = `${k}_vs_prom`;
    const dp = `${k}_delta_pct_prom`;
    return {
      resolvedMetricKey: k,
      referenceKey: null,
      deltaKey: delta,
      deltaPctKey: dp,
      referenceSeriesKey: null,
      tableExtraKeys: [delta, dp].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
    };
  }

  if (spec.kind === "total_share") {
    const dp = `${k}_pct_total`;
    const ref = `${k}_total_ref`;
    return {
      resolvedMetricKey: k,
      referenceKey: ref,
      deltaKey: null,
      deltaPctKey: dp,
      referenceSeriesKey: ref,
      tableExtraKeys: [dp, ref].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
    };
  }

  if (spec.kind === "cumulative") {
    if (spec.mode === "month_vs_ytd") {
      const ytd = `${k}_ytd`;
      const pct = `${k}_pct_mes_en_ytd`;
      return {
        resolvedMetricKey: k,
        referenceKey: ytd,
        deltaKey: null,
        deltaPctKey: pct,
        referenceSeriesKey: ytd,
        tableExtraKeys: [ytd, pct].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
      };
    }
    if (spec.mode === "vs_prior_year_ytd") {
      const d = `${k}_vs_ytd_ly`;
      const dp = `${k}_delta_pct_ytd_yoy`;
      const ytd = `${k}_ytd`;
      return {
        resolvedMetricKey: k,
        referenceKey: ytd,
        deltaKey: d,
        deltaPctKey: dp,
        referenceSeriesKey: ytd,
        tableExtraKeys: [ytd, d, dp].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
      };
    }
    // ytd_running
    const run = `${k}_ytd_run`;
    const ytd = `${k}_ytd`;
    const hasRun = Object.prototype.hasOwnProperty.call(row, run);
    const hasYtd = Object.prototype.hasOwnProperty.call(row, ytd);
    const refSeries = hasRun ? run : hasYtd ? ytd : null;
    return {
      resolvedMetricKey: k,
      referenceKey: hasYtd ? ytd : null,
      deltaKey: null,
      deltaPctKey: null,
      referenceSeriesKey: refSeries,
      tableExtraKeys: [run, ytd].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
    };
  }

  return {
    resolvedMetricKey: k,
    referenceKey: null,
    deltaKey: null,
    deltaPctKey: null,
    referenceSeriesKey: null,
    tableExtraKeys: [],
  };
}

export function readComparePresentation(
  spec: CompareSpec,
  metricAlias: string,
  row: Record<string, unknown>
): ComparePresentationValues {
  const keys = getCompareColumnKeys(spec, metricAlias, row);
  const k = keys.resolvedMetricKey;
  const current = k ? toNum(getRowValue(row, k)) : null;
  const reference = keys.referenceKey ? toNum(getRowValue(row, keys.referenceKey)) : null;
  let delta = keys.deltaKey ? toNum(getRowValue(row, keys.deltaKey)) : null;
  let deltaPct = keys.deltaPctKey ? toNum(getRowValue(row, keys.deltaPctKey)) : null;

  return { current, reference, delta, deltaPct };
}

/**
 * Valor principal del KPI: suma de la métrica en todas las filas del agregado.
 * Con comparación temporal la API puede devolver varios buckets; el total del rango no debe
 * sustituirse por el último período (eso va en la línea de comparación debajo).
 */
export function resolveDashboardKpiMainValue(
  rows: Record<string, unknown>[],
  yKey: string
): number {
  if (!rows.length || !yKey) return 0;
  return rows.reduce((acc, row) => {
    const n = Number((row as Record<string, unknown>)[yKey] ?? 0);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/** Fila recomendada para KPI con serie temporal: bucket de mayor fecha (alineado al período actual tras expansión de filtros). */
export function pickDashboardKpiCompareRow(
  rows: Record<string, unknown>[],
  spec: CompareSpec,
  parseOpts?: ParseDateLikeOptions
): Record<string, unknown> | null {
  if (!rows.length) return null;
  if (spec.kind === "temporal" || spec.kind === "cumulative") {
    const col = spec.timeColumn?.trim();
    if (!col) return rows[rows.length - 1] ?? null;
    let bestIdx = 0;
    let bestT = compareBucketSortTime(getRowValue(rows[0]!, col), spec.granularity, parseOpts);
    for (let i = 1; i < rows.length; i++) {
      const t = compareBucketSortTime(getRowValue(rows[i]!, col), spec.granularity, parseOpts);
      if (!Number.isNaN(t) && (Number.isNaN(bestT) || t > bestT)) {
        bestT = t;
        bestIdx = i;
      }
    }
    return rows[bestIdx] ?? null;
  }
  return rows[0] as Record<string, unknown>;
}

/** Huella estable de la línea de comparación KPI (invalida memo al cambiar filtros / refetch). */
export function kpiCompareRowsFingerprint(
  rows: Record<string, unknown>[] | undefined,
  agg: Parameters<typeof legacyCompareInputFromWidgetAgg>[0]
): string {
  if (!rows?.length) return "len:0";
  const spec = normalizeAggregationCompare(legacyCompareInputFromWidgetAgg(agg ?? undefined));
  if (spec.kind === "none") return `len:${rows.length}|none`;
  const metrics = (agg as { metrics?: { alias?: string }[] } | null | undefined)?.metrics ?? [];
  const alias =
    metrics.map((m) => String(m.alias ?? "").trim()).filter(Boolean)[0] ?? "metric_0";
  const row = pickDashboardKpiCompareRow(rows, spec) ?? (rows[rows.length - 1] as Record<string, unknown>);
  const vals = readComparePresentation(spec, alias, row);
  return `len:${rows.length}|${vals.delta ?? ""}|${vals.deltaPct ?? ""}|${vals.reference ?? ""}`;
}

export function compareTrendTone(values: ComparePresentationValues): "up" | "down" | "flat" {
  const primary =
    values.delta != null
      ? values.delta
      : values.deltaPct != null
        ? values.deltaPct
        : 0;
  if (primary > 0) return "up";
  if (primary < 0) return "down";
  return "flat";
}

export function formatDashboardCompareText(
  ui: DashboardCompareUi,
  values: ComparePresentationValues,
  valueStyle?: ChartStyleConfig
): string {
  const vf = valueStyle?.valueFormat ?? "none";
  const sc = valueStyle?.valueScale ?? "none";
  const cur = valueStyle?.currencySymbol ?? "$";
  const dec = valueStyle?.decimals ?? 2;
  const grp = valueStyle?.useGrouping !== false;
  const bits: string[] = [];
  const prefix = (ui.label?.trim() || "").trim();
  if (values.deltaPct != null && ui.showDeltaPct !== false) {
    const sign = values.deltaPct > 0 ? "+" : "";
    bits.push(
      `${sign}${Number(values.deltaPct).toLocaleString("es-ES", {
        maximumFractionDigits: 1,
        minimumFractionDigits: 0,
      })}%`
    );
  }
  if (values.delta != null && ui.showDelta !== false) {
    bits.push(formatValue(Number(values.delta), vf, cur, sc, dec, grp));
  }
  if (bits.length === 0) return "";
  return prefix ? `${prefix}: ${bits.join(" · ")}` : bits.join(" · ");
}

export function legacyCompareInputFromWidgetAgg(
  agg: {
    compare?: unknown;
    comparePeriod?: "previous_year" | "previous_month";
    compareFixedValue?: number;
    transformCompare?: string;
    transformCompareFixedValue?: string;
    dateDimension?: string;
    dateGroupByGranularity?: string;
    dimension?: string;
    dimensions?: string[];
    dimension2?: string;
  } | null | undefined
): LegacyCompareInput {
  if (!agg) return {};
  const dgField = pickDateGroupBySourceField(agg);
  const gran = agg.dateGroupByGranularity;
  return {
    compare: agg.compare,
    comparePeriod: agg.comparePeriod,
    compareFixedValue: agg.compareFixedValue,
    transformCompare: agg.transformCompare,
    transformCompareFixedValue: agg.transformCompareFixedValue,
    dateDimension: agg.dateDimension,
    dateGroupBy:
      dgField && gran ? { field: dgField, granularity: String(gran) } : undefined,
  };
}

export function buildCompareTooltipLineFromAgg(
  agg: {
    compare?: unknown;
    comparePeriod?: "previous_year" | "previous_month";
    compareFixedValue?: number;
    transformCompare?: string;
    transformCompareFixedValue?: string;
    dateDimension?: string;
    dateGroupByGranularity?: string;
    dimension?: string;
    dimensions?: string[];
    dimension2?: string;
    dashboardCompareUi?: DashboardCompareUi;
  } | null | undefined,
  row: Record<string, unknown>,
  primaryMetricAlias: string,
  valueStyle?: ChartStyleConfig
): string | null {
  if (!agg) return null;
  const spec = normalizeAggregationCompare(legacyCompareInputFromWidgetAgg(agg));
  if (spec.kind === "none") return null;
  const ui = getEffectiveDashboardCompareUi(agg);
  if (!ui?.enabled || !placementEnabled(ui, "tooltip")) return null;
  const vals = readComparePresentation(spec, primaryMetricAlias, row);
  const text = formatDashboardCompareText(ui, vals, valueStyle);
  return text.trim() !== "" ? text : null;
}
