/**
 * Infiere el tipo de cada columna (Fecha, Número, Texto) a partir de una muestra de filas.
 * Útil cuando el esquema de BD devuelve todo como texto (p. ej. Excel, CSV en etl_output).
 */

export type InferredColumnType = "Fecha" | "Número" | "Texto";

function isNumericLike(v: unknown): boolean {
  if (typeof v === "number" && !Number.isNaN(v)) return true;
  if (typeof v !== "string") return false;
  const trimmed = String(v).trim();
  if (!trimmed) return false;
  const sanitized = trimmed
    .replace(/\s+/g, "")
    .replace(/[%$€£]/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  return /^-?\d+(?:\.\d+)?$/.test(sanitized);
}

function isDateLike(v: unknown): boolean {
  if (v == null) return false;
  if (v instanceof Date && !isNaN((v as Date).getTime())) return true;
  if (typeof v === "number") {
    if (v > 1e10) return true;
    if (v > 0 && v < 1e7) return true; // Excel serial
  }
  if (typeof v !== "string") return false;
  const s = String(v).trim();
  if (!s) return false;
  if (!isNaN(Date.parse(s))) return true;
  const ddmmyy = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
  const m = s.match(ddmmyy);
  if (m) {
    const d = parseInt(m[1]!, 10);
    const M = parseInt(m[2]!, 10) - 1;
    const y = parseInt(m[3]!, 10);
    const yr = y < 100 ? 2000 + y : y;
    const dt = new Date(yr, M, d);
    if (!isNaN(dt.getTime()) && dt.getDate() === d && dt.getMonth() === M) return true;
  }
  return false;
}

function getRowVal(row: Record<string, unknown>, field: string): unknown {
  if (row[field] !== undefined && row[field] !== null) return row[field];
  const lower = field.toLowerCase();
  const key = Object.keys(row).find((k) => k.toLowerCase() === lower);
  return key !== undefined ? row[key] : undefined;
}

/**
 * Dada una muestra de filas (array de objetos), devuelve un mapa columna -> tipo inferido.
 * Prioridad: si la mayoría de valores no nulos parecen fecha -> Fecha; si número -> Número; sino Texto.
 * Las claves del resultado respetan el nombre de la primera aparición de cada columna (primer row).
 */
export function deriveColumnTypesFromSample(sampleData: unknown[]): Record<string, InferredColumnType> {
  const result: Record<string, InferredColumnType> = {};
  if (sampleData.length === 0) return result;
  const sampleRow = sampleData[0] as Record<string, unknown> | null;
  if (!sampleRow || typeof sampleRow !== "object") return result;
  const keySet = new Set<string>(Object.keys(sampleRow));
  for (const row of sampleData.slice(1)) {
    if (row && typeof row === "object") Object.keys(row as object).forEach((k) => keySet.add(k));
  }
  const availableFields = Array.from(keySet);

  for (const field of availableFields) {
    let nonNull = 0;
    let dateCount = 0;
    let numericCount = 0;
    for (const row of sampleData) {
      const r = row as Record<string, unknown> | null;
      if (!r || typeof r !== "object") continue;
      const val = getRowVal(r, field);
      if (val === null || val === undefined) continue;
      nonNull++;
      if (isDateLike(val)) dateCount++;
      else if (isNumericLike(val)) numericCount++;
    }
    if (nonNull === 0) {
      result[field] = "Texto";
      continue;
    }
    const ratio = nonNull / sampleData.length;
    if (ratio >= 0.6 && dateCount / nonNull >= 0.6) result[field] = "Fecha";
    else if (ratio >= 0.6 && numericCount / nonNull >= 0.6) result[field] = "Número";
    else result[field] = "Texto";
  }
  return result;
}
