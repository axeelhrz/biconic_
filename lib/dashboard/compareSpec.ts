import type { DateGranularity } from "@/lib/dashboard/dateFormatting";

/** Origen del período para comparaciones temporales (persistido en `compare` o `comparePeriodSource`). */
export type ComparePeriodSource = "dashboard" | "widget" | "fixed" | "data_max";

function parsePeriodSource(raw: unknown): ComparePeriodSource | undefined {
  if (raw === "dashboard" || raw === "widget" || raw === "fixed" || raw === "data_max") return raw;
  return undefined;
}

/** Modo temporal explícito (calendario vs serie). */
export type CompareTemporalMode =
  | "prev_bucket"
  | "same_period_prior_year"
  | "calendar_prev_day"
  | "calendar_prev_week"
  | "calendar_prev_month"
  | "calendar_prev_year";

export type CompareAverageScope = "global" | "partition";

export type CompareCumulativeMode = "month_vs_ytd" | "vs_prior_year_ytd" | "ytd_running";

export type CompareSpec =
  | { kind: "none" }
  | {
      kind: "temporal";
      mode: CompareTemporalMode;
      /** Columna de tiempo presente en cada fila (mismo nombre que en el resultado). */
      timeColumn: string;
      granularity: DateGranularity;
      /** Por defecto `dashboard`: hereda filtros del tablero + widget. */
      periodSource?: ComparePeriodSource;
    }
  | { kind: "column"; refColumn: string }
  | { kind: "fixed"; value: number }
  | {
      kind: "average";
      scope: CompareAverageScope;
      /** Si scope === "partition", lista de columnas de dimensión por las que promediar. */
      partitionDimensions: string[];
    }
  | {
      kind: "total_share";
      /** Vacío = total global; si no, SUM por esa partición. */
      partitionDimensions: string[];
    }
  | {
      kind: "cumulative";
      mode: CompareCumulativeMode;
      timeColumn: string;
      granularity: DateGranularity;
      periodSource?: ComparePeriodSource;
    };

const VALID_GRAN: DateGranularity[] = ["day", "week", "month", "quarter", "semester", "year"];

function asGranularity(v: string | undefined): DateGranularity {
  const g = (v || "month").toLowerCase().replace(/[^a-z]/g, "");
  return VALID_GRAN.includes(g as DateGranularity) ? (g as DateGranularity) : "month";
}

function isCompareTemporalMode(v: string): v is CompareTemporalMode {
  return (
    v === "prev_bucket" ||
    v === "same_period_prior_year" ||
    v === "calendar_prev_day" ||
    v === "calendar_prev_week" ||
    v === "calendar_prev_month" ||
    v === "calendar_prev_year"
  );
}

function parseCompareSpecObject(raw: unknown): CompareSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (kind === "none") return { kind: "none" };
  if (kind === "fixed" && typeof o.value === "number" && Number.isFinite(o.value)) {
    return { kind: "fixed", value: o.value };
  }
  if (kind === "column" && typeof o.refColumn === "string" && o.refColumn.trim()) {
    return { kind: "column", refColumn: o.refColumn.trim() };
  }
  if (kind === "temporal") {
    const mode = typeof o.mode === "string" ? o.mode : "";
    const timeColumn = typeof o.timeColumn === "string" ? o.timeColumn.trim() : "";
    if (!isCompareTemporalMode(mode) || !timeColumn) return null;
    return {
      kind: "temporal",
      mode,
      timeColumn,
      granularity: asGranularity(typeof o.granularity === "string" ? o.granularity : undefined),
      ...(() => {
        const ps = parsePeriodSource(o.periodSource);
        return ps ? { periodSource: ps } : {};
      })(),
    };
  }
  if (kind === "average") {
    const scope = o.scope === "partition" ? "partition" : "global";
    const parts = Array.isArray(o.partitionDimensions)
      ? o.partitionDimensions.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim())
      : [];
    return { kind: "average", scope, partitionDimensions: scope === "partition" ? parts : [] };
  }
  if (kind === "total_share") {
    const parts = Array.isArray(o.partitionDimensions)
      ? o.partitionDimensions.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim())
      : [];
    return { kind: "total_share", partitionDimensions: parts };
  }
  if (kind === "cumulative") {
    const mode = o.mode;
    const timeColumn = typeof o.timeColumn === "string" ? o.timeColumn.trim() : "";
    if (
      (mode !== "month_vs_ytd" && mode !== "vs_prior_year_ytd" && mode !== "ytd_running") ||
      !timeColumn
    )
      return null;
    return {
      kind: "cumulative",
      mode,
      timeColumn,
      granularity: asGranularity(typeof o.granularity === "string" ? o.granularity : undefined),
      ...(() => {
        const ps = parsePeriodSource(o.periodSource);
        return ps ? { periodSource: ps } : {};
      })(),
    };
  }
  return null;
}

export type LegacyCompareInput = {
  compare?: unknown;
  comparePeriod?: "previous_year" | "previous_month";
  compareFixedValue?: number;
  transformCompare?: string;
  transformCompareFixedValue?: string;
  dateGroupBy?: { field: string; granularity?: string };
  dateDimension?: string;
};

/**
 * Resuelve la comparación a aplicar: objeto `compare` explícito o compatibilidad con campos legacy.
 */
export function normalizeAggregationCompare(input: LegacyCompareInput): CompareSpec {
  const parsed = parseCompareSpecObject(input.compare);
  if (parsed) return parsed;

  const fixedFromBody =
    input.compareFixedValue != null && typeof input.compareFixedValue === "number" && Number.isFinite(input.compareFixedValue)
      ? input.compareFixedValue
      : null;
  if (fixedFromBody != null) return { kind: "fixed", value: fixedFromBody };

  if (input.transformCompare === "fixed" && input.transformCompareFixedValue) {
    const v = Number.parseFloat(String(input.transformCompareFixedValue));
    if (Number.isFinite(v)) return { kind: "fixed", value: v };
  }

  const timeField = (input.dateGroupBy?.field || input.dateDimension || "").trim();
  const gran = asGranularity(input.dateGroupBy?.granularity);
  const hasDateGroupBy = Boolean(input.dateGroupBy?.field?.trim());

  if (input.transformCompare === "mom" || input.comparePeriod === "previous_month") {
    if (hasDateGroupBy && timeField) {
      return { kind: "temporal", mode: "prev_bucket", timeColumn: timeField, granularity: gran };
    }
    if (timeField || input.dateDimension) {
      return {
        kind: "temporal",
        mode: "calendar_prev_month",
        timeColumn: timeField || String(input.dateDimension || "").trim(),
        granularity: gran,
      };
    }
  }

  if (input.transformCompare === "yoy" || input.comparePeriod === "previous_year") {
    if (hasDateGroupBy && timeField) {
      return { kind: "temporal", mode: "same_period_prior_year", timeColumn: timeField, granularity: gran };
    }
    if (timeField || input.dateDimension) {
      return {
        kind: "temporal",
        mode: "calendar_prev_year",
        timeColumn: timeField || String(input.dateDimension || "").trim(),
        granularity: gran,
      };
    }
  }

  return { kind: "none" };
}

/** Fuente de período efectiva para expansión de filtros (dashboard por defecto). */
export function getComparePeriodSource(
  spec: CompareSpec,
  aggComparePeriodSource?: ComparePeriodSource | string | null
): ComparePeriodSource {
  if (aggComparePeriodSource === "dashboard" || aggComparePeriodSource === "widget" || aggComparePeriodSource === "fixed" || aggComparePeriodSource === "data_max") {
    return aggComparePeriodSource;
  }
  if (spec.kind === "temporal" && spec.periodSource) return spec.periodSource;
  if (spec.kind === "cumulative" && spec.periodSource) return spec.periodSource;
  return "dashboard";
}

/**
 * Objetivo / meta: no hay tipo dedicado `target` aún. Opciones:
 * - Valor fijo por widget: `compare: { kind: "fixed", value: N }`.
 * - Meta en datos: agregar columna calculada o física en el ETL y usar `compare: { kind: "column", refColumn: "meta_ventas" }`.
 */
export function deriveLegacyTransformCompare(spec: CompareSpec): "none" | "mom" | "yoy" | "fixed" {
  if (spec.kind === "fixed") return "fixed";
  if (spec.kind === "temporal" && spec.mode === "same_period_prior_year") return "yoy";
  if (spec.kind === "temporal") return "mom";
  return "none";
}
