import {
  getProcessedRowsForChart,
  resolveChartYAxisEntryToResultKey,
  resolveWidgetAxisKeys,
  type BuildChartConfigWidget,
  type ChartConfig,
} from "@/lib/dashboard/buildChartConfig";
import {
  formatValue,
  type ChartStyleConfig,
  type ValueFormatType,
  type ValueScaleType,
} from "@/lib/dashboard/chartOptions";

export type ChartDetailCardTotalScope = "sum_column_in_rows";

export type ChartDetailCardLineBase = {
  id: string;
  label: string;
  valueFormat?: ValueFormatType;
  valueScale?: ValueScaleType;
  currencySymbol?: string;
  decimals?: number;
  useGrouping?: boolean;
  /** Redondea a entero y usa 0 decimales en el formateo numérico base. */
  integerOnly?: boolean;
};

export type ChartDetailCardLineRow = ChartDetailCardLineBase & {
  kind: "row";
  field: string;
};

export type ChartDetailCardLineComputed = ChartDetailCardLineBase & {
  kind: "computed";
  computed: "percent_of_total";
  numeratorField: string;
  totalScope?: ChartDetailCardTotalScope;
};

export type ChartDetailCardLine = ChartDetailCardLineRow | ChartDetailCardLineComputed;

export type ChartDetailCardConfig = {
  enabled?: boolean;
  /** Placeholders: {{category}}, {{series}} */
  title?: string;
  description?: string;
  lines?: ChartDetailCardLine[];
};

function normalizeValueFormat(v: unknown): ValueFormatType | undefined {
  if (v === "currency" || v === "percent" || v === "none") return v;
  return undefined;
}

function normalizeValueScale(v: unknown): ValueScaleType | undefined {
  if (v === "none" || v === "K" || v === "M" || v === "Bi" || v === "B") return v;
  return undefined;
}

function lineIdFallback(i: number): string {
  return `detail-line-${i}`;
}

export function normalizeChartDetailCard(raw: unknown): ChartDetailCardConfig | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const linesIn = Array.isArray(o.lines) ? o.lines : [];
  const lines: ChartDetailCardLine[] = [];
  for (let i = 0; i < linesIn.length; i++) {
    const L = linesIn[i] as Record<string, unknown>;
    if (!L || typeof L !== "object") continue;
    const id = typeof L.id === "string" && L.id.trim() ? L.id.trim() : lineIdFallback(i);
    const label = typeof L.label === "string" ? L.label.trim() : "";
    if (!label) continue;
    const valueFormat = normalizeValueFormat(L.valueFormat);
    const valueScale = normalizeValueScale(L.valueScale);
    const currencySymbol = typeof L.currencySymbol === "string" ? L.currencySymbol : undefined;
    const decimals = typeof L.decimals === "number" && Number.isFinite(L.decimals) ? Math.max(0, Math.floor(L.decimals)) : undefined;
    const useGrouping = typeof L.useGrouping === "boolean" ? L.useGrouping : undefined;
    const integerOnly = L.integerOnly === true;
    const base: ChartDetailCardLineBase = {
      id,
      label,
      ...(valueFormat != null ? { valueFormat } : {}),
      ...(valueScale != null ? { valueScale } : {}),
      ...(currencySymbol != null ? { currencySymbol } : {}),
      ...(decimals != null ? { decimals } : {}),
      ...(useGrouping != null ? { useGrouping } : {}),
      ...(integerOnly ? { integerOnly: true } : {}),
    };
    const kind = L.kind === "computed" ? "computed" : "row";
    if (kind === "computed" && L.computed === "percent_of_total") {
      const numeratorField = typeof L.numeratorField === "string" ? L.numeratorField.trim() : "";
      if (!numeratorField) continue;
      const totalScope: ChartDetailCardTotalScope =
        L.totalScope === "sum_column_in_rows" ? "sum_column_in_rows" : "sum_column_in_rows";
      lines.push({
        ...base,
        kind: "computed",
        computed: "percent_of_total",
        numeratorField,
        totalScope,
      });
    } else {
      const field = typeof L.field === "string" ? L.field.trim() : "";
      if (!field) continue;
      lines.push({ ...base, kind: "row", field });
    }
  }
  const enabled =
    o.enabled === false ? false : lines.length > 0 ? true : o.enabled === true ? true : false;
  if (!enabled || lines.length === 0) return undefined;
  const title = typeof o.title === "string" ? o.title : undefined;
  const description = typeof o.description === "string" ? o.description : undefined;
  return {
    enabled: true,
    ...(title != null && title !== "" ? { title } : {}),
    ...(description != null && description !== "" ? { description } : {}),
    lines,
  };
}

export function isChartDetailCardActive(raw: unknown): boolean {
  return normalizeChartDetailCard(raw) != null;
}

function parseFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/\s+/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function styleFromLine(line: ChartDetailCardLine): ChartStyleConfig {
  const fmt = line.valueFormat ?? "none";
  const scale = line.valueScale ?? "none";
  const decimals = line.integerOnly ? 0 : (line.decimals ?? (fmt === "percent" ? 1 : 2));
  return {
    valueFormat: fmt,
    valueScale: scale,
    currencySymbol: line.currencySymbol ?? "$",
    decimals,
    useGrouping: line.useGrouping !== false,
  };
}

export function formatDetailCardScalar(value: number, line: ChartDetailCardLine): string {
  const st = styleFromLine(line);
  if (line.integerOnly) {
    const rounded = Math.round(value);
    return formatValue(
      rounded,
      "none",
      st.currencySymbol ?? "$",
      (st.valueScale ?? "none") as ValueScaleType,
      0,
      st.useGrouping !== false
    );
  }
  if (line.valueFormat === "percent" && line.kind === "row") {
    const asRatio = Math.abs(value) <= 1 && !Number.isInteger(value);
    const pct = asRatio ? value * 100 : value;
    const d = line.decimals ?? 1;
    return `${pct.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: 0 })}%`;
  }
  return formatValue(
    value,
    (st.valueFormat ?? "none") as ValueFormatType,
    st.currencySymbol ?? "$",
    (st.valueScale ?? "none") as ValueScaleType,
    st.decimals ?? 2,
    st.useGrouping !== false
  );
}

function resolveFieldToResultKey(
  field: string,
  widget: BuildChartConfigWidget,
  resultKeys: string[]
): string | null {
  const metrics = (widget.aggregationConfig?.metrics ?? []) as Array<{ alias?: string; func?: string; field?: string }>;
  return resolveChartYAxisEntryToResultKey(String(field).trim(), metrics, resultKeys);
}

function sumColumn(rows: Record<string, unknown>[], resultKey: string | null): number {
  if (!resultKey) return 0;
  let s = 0;
  for (const r of rows) {
    const n = parseFiniteNumber(r[resultKey]);
    if (n != null) s += n;
  }
  return s;
}

export function interpolateDetailTitle(
  template: string | undefined,
  category: string,
  series: string
): string {
  if (!template || template.trim() === "") return category;
  return template.replace(/\{\{\s*category\s*\}\}/gi, category).replace(/\{\{\s*series\s*\}\}/gi, series);
}

function resolveSeriesRawValue(
  processedRows: Record<string, unknown>[],
  seriesField: string | undefined,
  datasetLabel: string,
  chartLabelOverrides: Record<string, string> | undefined
): string | null {
  if (!seriesField) return null;
  const unique = [...new Set(processedRows.map((r) => String((r as Record<string, unknown>)[seriesField] ?? "")))];
  for (const sv of unique) {
    if (!sv) continue;
    const overridden = chartLabelOverrides?.[sv] ?? chartLabelOverrides?.[String(sv).trim()];
    const display = typeof overridden === "string" && overridden.trim() !== "" ? overridden.trim() : sv;
    if (display === datasetLabel || sv === datasetLabel) return sv;
  }
  return null;
}

/**
 * Fila agregada alineada con el punto del tooltip (categoría + opcional serie).
 */
export function resolveDetailCardRow(params: {
  rows: Record<string, unknown>[] | undefined;
  widget: BuildChartConfigWidget;
  chartConfig: ChartConfig;
  dataIndex: number;
  datasetIndex: number;
  chartType: string;
}): Record<string, unknown> | null {
  const { rows, widget, chartConfig, dataIndex, datasetIndex, chartType } = params;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  if (dataIndex < 0 || dataIndex >= (chartConfig.labels?.length ?? 0)) return null;

  const processed = getProcessedRowsForChart(rows, widget);
  if (processed.length === 0) return null;

  const axis = resolveWidgetAxisKeys(rows, widget);
  if (!axis) return null;
  const { xKey, resultKeys } = axis;
  const rawX =
    chartConfig.xRawCategoryKeys && dataIndex < chartConfig.xRawCategoryKeys.length
      ? String(chartConfig.xRawCategoryKeys[dataIndex] ?? "")
      : String(chartConfig.labels[dataIndex] ?? "");

  const agg = widget.aggregationConfig ?? {};
  const seriesField = [String(agg.chartSeriesField ?? "").trim(), String(agg.dimension2 ?? "").trim()].find(
    (f) => f && f !== xKey && resultKeys.includes(f)
  );

  const resolvedType = String(agg.chartType ?? chartType ?? "").trim();
  const isPie = resolvedType === "pie" || resolvedType === "doughnut";

  if (isPie) {
    if (dataIndex >= 0 && dataIndex < processed.length) return processed[dataIndex] as Record<string, unknown>;
    return null;
  }

  const overrides = (agg.chartLabelOverrides ?? {}) as Record<string, string>;
  const ds = chartConfig.datasets?.[datasetIndex];
  const datasetLabel = ds?.label != null ? String(ds.label) : "";

  if (seriesField && chartConfig.datasets && chartConfig.datasets.length > 1) {
    const isComboLineAtEnd =
      resolvedType === "combo" &&
      datasetIndex === chartConfig.datasets.length - 1 &&
      chartConfig.datasets[datasetIndex]?.type === "line";
    if (isComboLineAtEnd) {
      const matchX = processed.find((r) => String((r as Record<string, unknown>)[xKey] ?? "") === rawX);
      return (matchX as Record<string, unknown>) ?? null;
    }
    const seriesRaw = resolveSeriesRawValue(processed, seriesField, datasetLabel, overrides);
    if (seriesRaw != null) {
      const hit = processed.find(
        (r) =>
          String((r as Record<string, unknown>)[xKey] ?? "") === rawX &&
          String((r as Record<string, unknown>)[seriesField] ?? "") === seriesRaw
      );
      return (hit as Record<string, unknown>) ?? null;
    }
  }

  const hit = processed.find((r) => String((r as Record<string, unknown>)[xKey] ?? "") === rawX);
  return (hit as Record<string, unknown>) ?? null;
}

export function buildDetailCardLineStrings(params: {
  detail: ChartDetailCardConfig;
  row: Record<string, unknown> | null;
  allRows: Record<string, unknown>[];
  widget: BuildChartConfigWidget;
}): string[] {
  const { detail, row, allRows, widget } = params;
  const axis = resolveWidgetAxisKeys(allRows, widget);
  const resultKeys = axis?.resultKeys ?? Object.keys(row ?? {});
  const metrics = (widget.aggregationConfig?.metrics ?? []) as Array<{ alias?: string; func?: string; field?: string }>;
  const out: string[] = [];
  for (const line of detail.lines ?? []) {
    if (line.kind === "row") {
      const key = resolveFieldToResultKey(line.field, widget, resultKeys) ?? line.field;
      const raw = row ? row[key] : undefined;
      if (raw == null || raw === "") {
        out.push(`${line.label}: —`);
        continue;
      }
      const n = parseFiniteNumber(raw);
      if (n == null) {
        out.push(`${line.label}: ${String(raw)}`);
        continue;
      }
      out.push(`${line.label}: ${formatDetailCardScalar(n, line)}`);
      continue;
    }
    if (line.computed === "percent_of_total") {
      const numKey = resolveFieldToResultKey(line.numeratorField, widget, resultKeys) ?? line.numeratorField;
      const num = row ? parseFiniteNumber(row[numKey]) : null;
      const total =
        line.totalScope === "sum_column_in_rows" || line.totalScope == null
          ? sumColumn(allRows, numKey)
          : sumColumn(allRows, numKey);
      if (num == null || !Number.isFinite(total) || total === 0) {
        out.push(`${line.label}: —`);
      } else {
        const pct = (num / total) * 100;
        const d = line.decimals ?? 1;
        out.push(
          `${line.label}: ${pct.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: 0 })}%`
        );
      }
    }
  }
  return out;
}

export function buildChartTooltipDetailParts(params: {
  detailRaw: unknown;
  rows: Record<string, unknown>[] | undefined;
  widget: BuildChartConfigWidget;
  chartConfig: ChartConfig;
  dataIndex: number;
  datasetIndex: number;
  chartType: string;
  /** Etiqueta de categoría ya formateada (eje X / porción). */
  categoryLabel: string;
  /** Etiqueta del dataset activo en el tooltip. */
  seriesLabel: string;
}): { title?: string; afterBody: string[] } | null {
  const detail = normalizeChartDetailCard(params.detailRaw);
  if (!detail || !Array.isArray(params.rows) || params.rows.length === 0) return null;

  const row = resolveDetailCardRow({
    rows: params.rows,
    widget: params.widget,
    chartConfig: params.chartConfig,
    dataIndex: params.dataIndex,
    datasetIndex: params.datasetIndex,
    chartType: params.chartType,
  });
  const processed = getProcessedRowsForChart(params.rows, params.widget);
  const lines = buildDetailCardLineStrings({
    detail,
    row,
    allRows: processed,
    widget: params.widget,
  });
  const afterBody: string[] = [];
  if (detail.description?.trim()) afterBody.push(detail.description.trim());
  afterBody.push(...lines);
  const title = detail.title?.trim()
    ? interpolateDetailTitle(detail.title, params.categoryLabel, params.seriesLabel)
    : undefined;
  return { ...(title ? { title } : {}), afterBody };
}

/** Mapa / fila única: mismas líneas que en gráficos, sin resolver por dataIndex. */
export function buildDetailCardLineStringsFromRowMap(params: {
  detailRaw: unknown;
  row: Record<string, unknown> | null;
  /** Todas las filas para totales de % (p. ej. suma de una métrica en todas las provincias). */
  sumRows: Record<string, unknown>[];
  widget: BuildChartConfigWidget;
}): { title?: string; lines: string[]; description?: string } | null {
  const detail = normalizeChartDetailCard(params.detailRaw);
  if (!detail) return null;
  const cat = String(params.row?.["__category"] ?? "").trim();
  const row = params.row ? { ...params.row, ...(cat ? { __category: cat } : {}) } : { __category: cat };
  const lines = buildDetailCardLineStrings({
    detail,
    row,
    allRows: params.sumRows,
    widget: params.widget,
  });
  const description = detail.description?.trim() || undefined;
  const title = detail.title?.trim()
    ? interpolateDetailTitle(detail.title, String(row["__category"] ?? ""), "")
    : undefined;
  return { ...(title ? { title } : {}), description, lines };
}

function escapeHtmlMap(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML seguro para Leaflet `bindPopup` cuando hay `chartDetailCard`. */
export function buildMapDetailPopupHtml(params: {
  placeTitle: string;
  row: Record<string, unknown> | null;
  sumRows: Record<string, unknown>[];
  widget: BuildChartConfigWidget;
  detailRaw: unknown;
}): string | null {
  const name = String(params.placeTitle ?? "").trim() || "—";
  const parsed = buildDetailCardLineStringsFromRowMap({
    detailRaw: params.detailRaw,
    row: params.row ? { ...params.row, __category: name } : { __category: name },
    sumRows: params.sumRows,
    widget: params.widget,
  });
  if (!parsed?.lines.length) return null;
  const head = escapeHtmlMap(parsed.title ?? name);
  const desc = parsed.description ? `<p class="mt-1 text-[11px] opacity-90">${escapeHtmlMap(parsed.description)}</p>` : "";
  const lines = parsed.lines.map((l) => `<div>${escapeHtmlMap(l)}</div>`).join("");
  return `<div class="text-xs space-y-1"><strong>${head}</strong>${desc}${lines}</div>`;
}
