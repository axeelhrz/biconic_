export type TableLayoutConfig = {
  tableRowFields?: string[];
  tableColumnFields?: string[];
  chartYAxes?: string[];
  chartXAxis?: string;
  dimension?: string;
  dimensions?: string[];
  dimension2?: string;
};

export type TablePresentation = {
  columns: string[];
  rows: Record<string, unknown>[];
  pivoted: boolean;
};

function uniqueOrdered(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    const t = String(k ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function compositeKey(row: Record<string, unknown>, fields: string[]): string {
  return fields.map((f) => String(row[f] ?? "")).join("\u0001");
}

/** Resuelve filas/columnas/valores para tabla desde config (con fallback legacy). */
export function resolveTableLayoutFields(
  agg: TableLayoutConfig | null | undefined,
  availableKeys: string[]
): { rowFields: string[]; columnFields: string[]; valueFields: string[] } {
  const keySet = new Set(availableKeys);
  const keep = (keys: string[] | undefined) => uniqueOrdered((keys ?? []).filter((k) => keySet.has(k)));

  const rowFields = keep(agg?.tableRowFields);
  const columnFields = keep(agg?.tableColumnFields);
  const valueFields = keep(agg?.chartYAxes);

  if (rowFields.length > 0 || columnFields.length > 0 || valueFields.length > 0) {
    return { rowFields, columnFields, valueFields };
  }

  const legacyDims = uniqueOrdered(
    [
      agg?.chartXAxis,
      agg?.dimension,
      ...(Array.isArray(agg?.dimensions) ? agg.dimensions : []),
      agg?.dimension2,
    ]
      .map((k) => String(k ?? "").trim())
      .filter((k) => k && keySet.has(k))
  );

  const legacyValues = availableKeys.filter((k) => !legacyDims.includes(k));

  return { rowFields: [], columnFields: legacyDims, valueFields: legacyValues };
}

function pivotTableRows(
  sourceRows: Record<string, unknown>[],
  rowFields: string[],
  columnFields: string[],
  valueFields: string[]
): TablePresentation {
  const colDim = columnFields[0]!;
  const colValues = uniqueOrdered(sourceRows.map((r) => String(r[colDim] ?? "")));
  const metrics = valueFields.length > 0 ? valueFields : [];

  const metricHeaders: { header: string; colValue: string; metric: string }[] = [];
  for (const colVal of colValues) {
    for (const metric of metrics) {
      const header = metrics.length > 1 ? `${colVal} · ${metric}` : colVal;
      metricHeaders.push({ header, colValue: colVal, metric });
    }
  }

  const columns = [...rowFields, ...metricHeaders.map((h) => h.header)];
  const rowMap = new Map<string, Record<string, unknown>>();

  for (const src of sourceRows) {
    const rk = compositeKey(src, rowFields);
    if (!rowMap.has(rk)) {
      const base: Record<string, unknown> = {};
      for (const rf of rowFields) base[rf] = src[rf];
      rowMap.set(rk, base);
    }
    const target = rowMap.get(rk)!;
    const cv = String(src[colDim] ?? "");
    for (const mh of metricHeaders) {
      if (mh.colValue !== cv) continue;
      target[mh.header] = src[mh.metric];
    }
  }

  return { columns, rows: [...rowMap.values()], pivoted: true };
}

/**
 * Construye filas/columnas de tabla según asignación X (columnas), Y (filas) y métricas (valores).
 */
export function buildTablePresentation(
  sourceRows: Record<string, unknown>[],
  agg: TableLayoutConfig | null | undefined
): TablePresentation {
  if (!Array.isArray(sourceRows) || sourceRows.length === 0) {
    return { columns: [], rows: [], pivoted: false };
  }

  const availableKeys = Object.keys(sourceRows[0] ?? {});
  const { rowFields, columnFields, valueFields } = resolveTableLayoutFields(agg, availableKeys);

  if (rowFields.length > 0 && columnFields.length > 0) {
    return pivotTableRows(sourceRows, rowFields, columnFields, valueFields);
  }

  const columns = uniqueOrdered([
    ...rowFields,
    ...columnFields.filter((c) => !rowFields.includes(c)),
    ...valueFields.filter((v) => !rowFields.includes(v) && !columnFields.includes(v)),
  ]);

  if (columns.length === 0) {
    return { columns: availableKeys, rows: sourceRows, pivoted: false };
  }

  const rows = sourceRows.map((src) => {
    const out: Record<string, unknown> = {};
    for (const c of columns) out[c] = src[c];
    return out;
  });

  return { columns, rows, pivoted: false };
}
