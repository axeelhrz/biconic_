/**
 * Infiere el tipo de cada columna (Fecha, Número, Texto) a partir de una muestra de filas.
 * Útil cuando el esquema de BD devuelve todo como texto (p. ej. Excel, CSV en etl_output).
 */

import { parseDateLike } from "@/lib/dashboard/dateFormatting";

export type InferredColumnType = "Fecha" | "Número" | "Texto";

/** Formato sugerido para la UI del ETL (columnDisplay.format). */
export type InferredColumnFormat = "" | "currency" | "percent" | "number" | "DD/MM/YYYY";

export type InferredColumnMetadata = {
  type: InferredColumnType;
  format?: InferredColumnFormat;
};

const IDENTIFIER_NAME_RE =
  /(?:^|_)(codigo|código|cod|sku|cuit|cuil|cbu|dni|legajo|barcode|ean|gtin|isbn|partida|comprobante|tipocomprobante|nrodoc|numdoc)(?:_|$)/i;

const DATE_DIMENSION_NAME_RE =
  /(?:^|_)(mes|month|anio|año|year|periodo|fecha|dia|day)(?:_|$)/i;

/** Montos, precios e importes → formato moneda. */
const CURRENCY_NAME_RE =
  /(?:^|_)(precio|precio_unitario|preciounitario|importe|monto|subtotal|costo|coste|valor|amount|price|tarifa|saldo|neto|bruto|facturado|pagado|pago|cobrado|debe|haber|unitario|unitprice|venta|compra|recaudacion|ingreso|egreso|descuento|recargo|impuesto|iva|iibb|exento|gravado|remito|total_linea|total_neto|total_bruto|importe_neto|importe_bruto|precio_venta|precio_compra|gran_total|monto_total|importe_total)(?:_|$)/i;

const PERCENT_NAME_RE =
  /(?:^|_)(porcentaje|porc|pct|percent|tasa|alicuota|alícuota|descuento_pct)(?:_|$)/i;

const QUANTITY_NAME_RE =
  /(?:^|_)(cantidad|cant|qty|quantity|unidades|unidad|stock|bultos|piezas|items|item_count|num_items)(?:_|$)/i;

const INTEGER_COUNT_NAME_RE =
  /(?:^|_)(count|conteo|numero|nro|num|secuencia|renglon|linea|line)(?:_|$)/i;

/** Tipos de esquema ambiguos donde conviene mirar la muestra de datos. */
export function isWeakSchemaDataType(dataType: string | undefined): boolean {
  if (!dataType) return true;
  const d = String(dataType).toLowerCase();
  return (
    d.includes("varchar") ||
    d.includes("character") ||
    d.includes("char") ||
    d === "text" ||
    d.includes("clob") ||
    d.includes("string") ||
    d.includes("blob")
  );
}

/** Mapea data_type de BD a tipo inferido; null si el esquema no es concluyente. */
export function inferTypeFromSchemaDataType(dataType: string | undefined): InferredColumnType | null {
  if (!dataType || isWeakSchemaDataType(dataType)) return null;
  const d = String(dataType).toLowerCase();
  if (["date", "timestamp", "timestamptz", "datetime", "time"].some((t) => d.includes(t))) return "Fecha";
  if (["int", "integer", "bigint", "smallint", "numeric", "decimal", "float", "double", "real", "number"].some((t) => d.includes(t))) {
    return "Número";
  }
  return "Texto";
}

/** Combina esquema de BD y muestra: el esquema fuerte gana; si no, la muestra. */
export function mergeColumnInferredType(params: {
  columnName: string;
  schemaDataType?: string;
  sampleInferred?: InferredColumnType;
}): InferredColumnType {
  const fromSchema = inferTypeFromSchemaDataType(params.schemaDataType);
  if (fromSchema) return fromSchema;
  if (params.sampleInferred) return params.sampleInferred;
  return inferTypeFromSchemaDataType(params.schemaDataType) ?? "Texto";
}

function bareColumnName(field: string): string {
  return field
    .replace(/^primary[._]/i, "")
    .replace(/^join_\d+[._]/i, "")
    .trim();
}

function looksLikeIdentifierField(field: string): boolean {
  const bare = bareColumnName(field);
  if (!bare) return false;
  return IDENTIFIER_NAME_RE.test(bare);
}

function looksLikeDateDimensionField(field: string): boolean {
  const bare = bareColumnName(field);
  if (!bare) return false;
  return DATE_DIMENSION_NAME_RE.test(bare);
}

function looksLikeCurrencyField(field: string): boolean {
  const bare = bareColumnName(field);
  if (!bare) return false;
  if (/^total$/i.test(bare)) return true;
  return CURRENCY_NAME_RE.test(bare);
}

function looksLikePercentField(field: string): boolean {
  const bare = bareColumnName(field);
  if (!bare) return false;
  return PERCENT_NAME_RE.test(bare);
}

function looksLikeQuantityField(field: string): boolean {
  const bare = bareColumnName(field);
  if (!bare) return false;
  return QUANTITY_NAME_RE.test(bare);
}

function looksLikeIntegerCountField(field: string): boolean {
  const bare = bareColumnName(field);
  if (!bare) return false;
  return INTEGER_COUNT_NAME_RE.test(bare);
}

/** Formato por defecto según nombre de columna y tipo inferido. */
export function inferFormatForColumn(
  columnName: string,
  type: InferredColumnType,
  sampleValues: unknown[] = [],
): InferredColumnFormat {
  if (type === "Fecha") return "DD/MM/YYYY";
  if (type === "Texto") return "";

  if (looksLikePercentField(columnName)) return "percent";
  if (looksLikeQuantityField(columnName) || looksLikeIntegerCountField(columnName)) return "number";
  if (looksLikeCurrencyField(columnName)) return "currency";

  let nonNull = 0;
  let currencyHint = 0;
  let percentHint = 0;
  let hasDecimals = 0;
  for (const v of sampleValues) {
    if (v === null || v === undefined || String(v).trim() === "") continue;
    nonNull++;
    const s = String(v).trim();
    if (/[$€£]/.test(s)) currencyHint++;
    if (/%/.test(s)) percentHint++;
    const n = parseLocalizedNumber(v);
    if (n != null && !Number.isInteger(n)) hasDecimals++;
  }

  if (nonNull > 0) {
    if (percentHint / nonNull >= 0.25) return "percent";
    if (currencyHint / nonNull >= 0.25) return "currency";
    if (hasDecimals / nonNull >= 0.5 && !looksLikeIntegerCountField(columnName)) return "currency";
  }

  return "number";
}

/** Tipo + formato sugerido combinando esquema, muestra y nombre de columna. */
export function inferColumnMetadata(params: {
  columnName: string;
  schemaDataType?: string;
  sampleInferred?: InferredColumnType;
  sampleValues?: unknown[];
}): InferredColumnMetadata {
  const type = mergeColumnInferredType({
    columnName: params.columnName,
    schemaDataType: params.schemaDataType,
    sampleInferred: params.sampleInferred,
  });

  if (type === "Texto" && looksLikeCurrencyField(params.columnName)) {
    const values = params.sampleValues ?? [];
    const numericRatio =
      values.filter((v) => v != null && String(v).trim() !== "").length > 0
        ? values.filter((v) => v != null && String(v).trim() !== "" && isNumericLike(v)).length /
          values.filter((v) => v != null && String(v).trim() !== "").length
        : 0;
    if (numericRatio >= 0.5) {
      return { type: "Número", format: "currency" };
    }
  }

  if (type === "Texto" && looksLikePercentField(params.columnName)) {
    const values = params.sampleValues ?? [];
    const numericRatio =
      values.filter((v) => v != null && String(v).trim() !== "").length > 0
        ? values.filter((v) => v != null && String(v).trim() !== "" && isNumericLike(v)).length /
          values.filter((v) => v != null && String(v).trim() !== "").length
        : 0;
    if (numericRatio >= 0.5) {
      return { type: "Número", format: "percent" };
    }
  }

  return {
    type,
    format: inferFormatForColumn(params.columnName, type, params.sampleValues ?? []),
  };
}

export function mergeColumnInferredFormat(params: {
  columnName: string;
  type: InferredColumnType;
  sampleFormat?: InferredColumnFormat;
  userFormat?: string;
}): InferredColumnFormat {
  if (params.userFormat?.trim()) return params.userFormat.trim() as InferredColumnFormat;
  if (params.sampleFormat?.trim()) return params.sampleFormat;
  return inferFormatForColumn(params.columnName, params.type);
}

/** Cadenas que deben tratarse como código/identificador, no como número. */
function isIdentifierLikeString(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/[A-Za-z]/.test(trimmed)) return true;
  if (/^0\d+$/.test(trimmed)) return true;
  if (/^\d{11,}$/.test(trimmed)) return true;
  return false;
}

/**
 * Parsea números con separadores locales (1.234,56 / 1,234.56 / 12.34).
 * Devuelve null si el valor parece código u otro texto numérico ambiguo.
 */
function parseLocalizedNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || isIdentifierLikeString(trimmed)) return null;

  let normalized = trimmed.replace(/\s+/g, "").replace(/[%$€£]/g, "");
  const hasDot = normalized.includes(".");
  const hasComma = normalized.includes(",");

  if (hasDot && hasComma) {
    const lastDot = normalized.lastIndexOf(".");
    const lastComma = normalized.lastIndexOf(",");
    normalized =
      lastComma > lastDot
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (hasComma) {
    const parts = normalized.split(",");
    normalized = parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2
      ? normalized.replace(",", ".")
      : normalized.replace(/,/g, "");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function isNumericLike(v: unknown): boolean {
  return parseLocalizedNumber(v) != null;
}

function isPlausibleExcelSerial(n: number): boolean {
  return Number.isFinite(n) && n >= 7305 && n <= 60000;
}

function isDateLike(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 1e12 || (v > 1e9 && v < 1e10)) return parseDateLike(v, { slashDateOrder: "DMY" }) != null;
    if (Number.isInteger(v) && Math.abs(v) < 1000) return false;
    if (isPlausibleExcelSerial(v)) return parseDateLike(v, { slashDateOrder: "DMY" }) != null;
    return false;
  }
  if (typeof v === "string") {
    const raw = v.trim();
    if (/^\d{1,3}$/.test(raw)) return false;
    if (/^\d+(\.\d+)?$/.test(raw)) {
      const n = Number(raw);
      if (Number.isInteger(n) && n < 1000) return false;
      if (!isPlausibleExcelSerial(n) && n < 1e9) return false;
    }
  }
  return parseDateLike(v, { slashDateOrder: "DMY" }) != null;
}

/** Número que representa mes (1-12). */
function isMonthLike(v: unknown): boolean {
  const n = parseLocalizedNumber(v);
  return n != null && Number.isInteger(n) && n >= 1 && n <= 12;
}

/** Número que representa año (1900-2100). */
function isYearLike(v: unknown): boolean {
  const n = parseLocalizedNumber(v);
  return n != null && Number.isInteger(n) && n >= 1900 && n <= 2100;
}

function getRowVal(row: Record<string, unknown>, field: string): unknown {
  if (row[field] !== undefined && row[field] !== null) return row[field];
  const lower = field.toLowerCase();
  const key = Object.keys(row).find((k) => k.toLowerCase() === lower);
  return key !== undefined ? row[key] : undefined;
}

function inferTypeFromCounts(
  field: string,
  nonNull: number,
  sampleSize: number,
  dateCount: number,
  numericCount: number,
  monthLikeCount: number,
  yearLikeCount: number,
): InferredColumnType {
  if (nonNull === 0) return "Texto";
  if (looksLikeIdentifierField(field)) return "Texto";

  const dateRatio = dateCount / nonNull;
  const numericRatio = numericCount / nonNull;

  if (dateRatio >= 0.85) return "Fecha";
  if (numericRatio >= 0.85) {
    if (
      looksLikeDateDimensionField(field) &&
      numericCount > 0 &&
      (monthLikeCount / numericCount >= 0.9 || yearLikeCount / numericCount >= 0.9)
    ) {
      return "Fecha";
    }
    return "Número";
  }

  if (nonNull / sampleSize >= 0.4 && dateRatio >= 0.6) return "Fecha";
  if (nonNull / sampleSize >= 0.4 && numericRatio >= 0.6) {
    if (
      looksLikeDateDimensionField(field) &&
      numericCount > 0 &&
      (monthLikeCount / numericCount >= 0.9 || yearLikeCount / numericCount >= 0.9)
    ) {
      return "Fecha";
    }
    return "Número";
  }

  return "Texto";
}

/**
 * Dada una muestra de filas (array de objetos), devuelve un mapa columna -> tipo inferido.
 * Prioridad en la muestra: fecha -> número -> texto. Los códigos/IDs no se tratan como número.
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
    result[field] = inferTypeFromCounts(
      field,
      nonNull,
      sampleData.length,
      dateCount,
      numericCount,
      monthLikeCount,
      yearLikeCount,
    );
  }
  return result;
}

/** Muestra de valores por columna (case-insensitive). */
function sampleValuesForField(sampleData: unknown[], field: string): unknown[] {
  const out: unknown[] = [];
  for (const row of sampleData) {
    const r = row as Record<string, unknown> | null;
    if (!r || typeof r !== "object") continue;
    const val = getRowVal(r, field);
    if (val !== null && val !== undefined) out.push(val);
  }
  return out;
}

/**
 * Tipo y formato sugerido por columna a partir de una muestra de filas.
 */
export function deriveColumnMetadataFromSample(sampleData: unknown[]): Record<string, InferredColumnMetadata> {
  const types = deriveColumnTypesFromSample(sampleData);
  const result: Record<string, InferredColumnMetadata> = {};
  for (const [field, type] of Object.entries(types)) {
    const values = sampleValuesForField(sampleData, field);
    result[field] = inferColumnMetadata({
      columnName: field,
      sampleInferred: type,
      sampleValues: values,
    });
  }
  return result;
}
