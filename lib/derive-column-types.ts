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

const EXCEL_EPOCH_MS = new Date(1899, 11, 30).getTime();
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PLAUSIBLE_DATE_YEAR_MIN = 1970;
const PLAUSIBLE_DATE_YEAR_MAX = 2040;

function isDateLike(v: unknown): boolean {
  if (v == null) return false;
  if (v instanceof Date && !isNaN((v as Date).getTime())) return true;
  if (typeof v === "number") {
    if (v > 1e10) {
      const y = new Date(v).getUTCFullYear();
      return y >= PLAUSIBLE_DATE_YEAR_MIN && y <= PLAUSIBLE_DATE_YEAR_MAX;
    }
    if (v > 1e9 && v < 1e10) {
      const y = new Date(v * 1000).getUTCFullYear();
      return y >= PLAUSIBLE_DATE_YEAR_MIN && y <= PLAUSIBLE_DATE_YEAR_MAX;
    }
    if (v > 0 && v < 1e7) {
      const y = new Date(EXCEL_EPOCH_MS + v * MS_PER_DAY).getUTCFullYear();
      return y >= PLAUSIBLE_DATE_YEAR_MIN && y <= PLAUSIBLE_DATE_YEAR_MAX;
    }
  }
  if (typeof v !== "string") return false;
  const s = String(v).trim();
  if (!s) return false;
  // Códigos/IDs numéricos (solo dígitos y más de 4 caracteres) no son fechas
  if (/^\d{5,}$/.test(s)) return false;
  // Solo considerar fecha si el string parece una fecha (evita "RIO NORTE 1", "CBA SUR", etc.)
  const looksLikeDateString =
    /^\d/.test(s) ||
    /^\d{4}-\d{2}-\d{2}/.test(s) ||
    /^\d{1,2}[\/\-\.]\d{1,2}/.test(s);
  if (!looksLikeDateString) return false;
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

/** Número que representa mes (1-12). */
function isMonthLike(v: unknown): boolean {
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 12) return true;
  if (typeof v === "string") {
    const n = parseInt(String(v).trim(), 10);
    return !Number.isNaN(n) && n >= 1 && n <= 12 && String(n) === String(v).trim();
  }
  return false;
}

/** Número que representa año (1900-2100). */
function isYearLike(v: unknown): boolean {
  if (typeof v === "number" && Number.isInteger(v) && v >= 1900 && v <= 2100) return true;
  if (typeof v === "string") {
    const n = parseInt(String(v).trim(), 10);
    return !Number.isNaN(n) && n >= 1900 && n <= 2100 && String(n) === String(v).trim();
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
 * Prioridad: fecha (incluye fechas completas, mes 1-12 y año 1900-2100) -> Fecha; si número -> Número; sino Texto.
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
    let monthLikeCount = 0;
    let yearLikeCount = 0;
    for (const row of sampleData) {
      const r = row as Record<string, unknown> | null;
      if (!r || typeof r !== "object") continue;
      const val = getRowVal(r, field);
      if (val === null || val === undefined) continue;
      nonNull++;
      if (isDateLike(val)) dateCount++;
      else if (isNumericLike(val)) {
        numericCount++;
        if (isMonthLike(val)) monthLikeCount++;
        if (isYearLike(val)) yearLikeCount++;
      }
    }
    if (nonNull === 0) {
      result[field] = "Texto";
      continue;
    }
    const ratio = nonNull / sampleData.length;
    if (ratio >= 0.6 && dateCount / nonNull >= 0.6) result[field] = "Fecha";
    else if (ratio >= 0.6 && numericCount / nonNull >= 0.6) {
      if (numericCount > 0 && (monthLikeCount / numericCount >= 0.9 || yearLikeCount / numericCount >= 0.9)) {
        result[field] = "Fecha";
      } else {
        result[field] = "Número";
      }
    } else result[field] = "Texto";
  }
  return result;
}
