/**
 * Infiere el tipo de cada columna (Fecha, Número, Texto) a partir de una muestra de filas.
 * Útil cuando el esquema de BD devuelve todo como texto (p. ej. Excel, CSV en etl_output).
 */

import { parseDateLike } from "@/lib/dashboard/dateFormatting";

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
  return parseDateLike(v, { slashDateOrder: "DMY" }) != null;
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
