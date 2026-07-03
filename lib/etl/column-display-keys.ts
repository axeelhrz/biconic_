/** Ref del ETL (primary.col, join_0.col) → clave de fila en tabla (primary_col, join_0_col). */
export function configColToRowKey(configKey: string): string {
  return (configKey || "")
    .trim()
    .replace(/^primary\./i, "primary_")
    .replace(/^join_(\d+)\./i, (_, d) => `join_${parseInt(d, 10)}_`)
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toLowerCase();
}

export type ColumnDisplayEntry = { label?: string; format?: string; type?: string };

/** Resuelve la clave en columnDisplay para una columna (config o fila). */
export function resolveColumnDisplayKey(
  col: string,
  columnDisplay?: Record<string, ColumnDisplayEntry> | null
): string {
  if (!columnDisplay) return col;
  if (columnDisplay[col] !== undefined) return col;

  const colLower = col.toLowerCase();
  const colNorm = configColToRowKey(col);

  for (const k of Object.keys(columnDisplay)) {
    if (k.toLowerCase() === colLower) return k;
    if (configColToRowKey(k) === colNorm) return k;
    if (k.replace(/\./g, "_").toLowerCase() === colLower) return k;
  }
  return col;
}

/** Etiqueta visible: label del ETL o nombre sin prefijo primary_/join_N_. */
export function getColumnDisplayLabel(
  col: string,
  columnDisplay?: Record<string, ColumnDisplayEntry> | null
): string {
  if (!columnDisplay) {
    const bare = col.replace(/^(primary|join_\d+)[._]/i, "");
    return bare || col;
  }
  const key = resolveColumnDisplayKey(col, columnDisplay);
  const label = columnDisplay[key]?.label?.trim();
  if (label) return label;
  const bare = col.replace(/^(primary|join_\d+)[._]/i, "");
  return bare || col;
}

/** Duplica entradas bajo claves de fila para lookup directo desde Postgres. */
export function expandColumnDisplayMap(
  columnDisplay: Record<string, ColumnDisplayEntry>
): Record<string, ColumnDisplayEntry> {
  const out: Record<string, ColumnDisplayEntry> = { ...columnDisplay };
  for (const [configKey, entry] of Object.entries(columnDisplay)) {
    const rowKey = configColToRowKey(configKey);
    if (rowKey && out[rowKey] === undefined) {
      out[rowKey] = entry;
    }
  }
  return out;
}
