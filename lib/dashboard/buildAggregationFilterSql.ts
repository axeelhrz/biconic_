import { safeNumericCast } from "@/lib/dashboard/coerceNumericSqlExpr";
import { buildMonthFilterSqlClause } from "@/lib/dashboard/monthFilterSql";
import { toSqlLiteral } from "@/lib/dashboard/toSqlLiteral";

export type AggregationFilterSqlInput = {
  field: string;
  operator: string;
  value?: unknown;
  cast?: "numeric" | "sanitize" | string;
};

export type BuildAggregationFilterSqlOptions = {
  /** Expresión SQL ya resuelta/quoted para el campo (sin alias). */
  fieldExpression: string;
  /** Orden de fecha slash para casts de fecha (si aplica en el caller). */
  expandMonthValue?: (field: string, value: unknown) => unknown;
  /** Lista de filtros (para expandir mes con año). */
  allFilters?: AggregationFilterSqlInput[];
};

const COMPARISON_OPS = new Set([">", ">=", "<", "<="]);
const INEQUALITY_OPS = new Set(["!=", "<>", "NE", "DISTINCT", "IS DISTINCT FROM"]);
const TEXT_PATTERN_OPS = new Set([
  "CONTAINS",
  "NOT_CONTAINS",
  "DOES_NOT_CONTAIN",
  "STARTS_WITH",
  "ENDS_WITH",
]);

/** ¿El valor se puede interpretar como número para comparaciones >, <, etc.? */
export function filterValueLooksNumeric(value: unknown): boolean {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  if (typeof value === "boolean") return false;
  if (value == null) return false;
  const s = String(value).trim();
  if (!s) return false;
  // Evitar códigos con ceros a la izquierda tipo "001" salvo decimales.
  if (/^0\d+$/.test(s)) return false;
  const normalized = s.replace(/\s/g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(normalized);
}

export function parseFilterNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!filterValueLooksNumeric(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Escapa % y _ para patrones ILIKE/LIKE. */
export function escapeSqlLikePattern(raw: string): string {
  return String(raw ?? "").replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function isYearLikeValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((v) => isYearLikeValue(v));
  }
  if (typeof value === "number") return Number.isInteger(value) && value >= 1900 && value <= 2100;
  const s = String(value ?? "").trim();
  return /^\d{4}$/.test(s) && Number(s) >= 1900 && Number(s) <= 2100;
}

/**
 * Normaliza el operador de filtro a una forma canónica en mayúsculas.
 */
export function normalizeAggregationFilterOperator(operator: string | undefined | null): string {
  const raw = String(operator ?? "=").trim();
  if (!raw) return "=";
  const upper = raw.toUpperCase();
  // Aliases en español / legacy
  if (upper === "DISTINTO" || upper === "DIFERENTE" || upper === "NE") return "!=";
  if (upper === "CONTIENE") return "CONTAINS";
  if (upper === "NO CONTIENE" || upper === "NO_CONTIENE" || upper === "DOES_NOT_CONTAIN") {
    return "NOT_CONTAINS";
  }
  if (upper === "COMIENZA POR" || upper === "EMPIEZA CON") return "STARTS_WITH";
  if (upper === "TERMINA EN" || upper === "TERMINA CON") return "ENDS_WITH";
  if (upper === "MAYOR QUE") return ">";
  if (upper === "MAYOR O IGUAL" || upper === "MAYOR O IGUAL QUE") return ">=";
  if (upper === "MENOR QUE") return "<";
  if (upper === "MENOR O IGUAL" || upper === "MENOR O IGUAL QUE") return "<=";
  if (upper === "IGUAL") return "=";
  return upper;
}

/**
 * Construye un fragmento SQL WHERE para un filtro de agregación/dashboard.
 * Cubré: =, !=, <>, >, >=, <, <=, CONTAINS, NOT_CONTAINS, STARTS_WITH, ENDS_WITH,
 * LIKE/ILIKE, IN, BETWEEN, IS/IS NOT, y operadores de fecha.
 */
export function buildAggregationFilterSqlClause(
  filter: AggregationFilterSqlInput,
  options: BuildAggregationFilterSqlOptions
): string {
  const op = normalizeAggregationFilterOperator(filter.operator);
  const fieldExpression = options.fieldExpression;
  const value = filter.value;

  const useDateExprForYearLike =
    (op === "=" && isYearLikeValue(value)) ||
    (op === "IN" && Array.isArray(value) && value.length > 0 && isYearLikeValue(value));

  // Operadores de fecha (el caller ya debería haber casteado a date si corresponde).
  if (op === "MONTH") {
    const monthVal = options.expandMonthValue
      ? options.expandMonthValue(filter.field, value)
      : value;
    return buildMonthFilterSqlClause(fieldExpression, monthVal);
  }
  if (op === "YEAR") {
    if (Array.isArray(value)) {
      const list = value
        .map((v) => Number(v))
        .filter((n) => !isNaN(n))
        .join(", ");
      return list ? `EXTRACT(YEAR FROM ${fieldExpression}) IN (${list})` : "TRUE";
    }
    return `EXTRACT(YEAR FROM ${fieldExpression}) = ${Number(value)}`;
  }
  if (op === "DAY") {
    const dayStr = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) return "TRUE";
    return `${fieldExpression} = DATE '${dayStr}'`;
  }
  if (op === "QUARTER") {
    if (Array.isArray(value)) {
      const list = value
        .map((v) => Number(v))
        .filter((n) => !isNaN(n) && n >= 1 && n <= 4)
        .join(", ");
      if (!list) return "TRUE";
      return `EXTRACT(QUARTER FROM ${fieldExpression}) IN (${list})`;
    }
    const q = Number(value);
    if (isNaN(q) || q < 1 || q > 4) return "TRUE";
    return `EXTRACT(QUARTER FROM ${fieldExpression}) = ${q}`;
  }
  if (op === "SEMESTER") {
    const semExpr = `(CASE WHEN EXTRACT(MONTH FROM ${fieldExpression}) <= 6 THEN 1 ELSE 2 END)`;
    if (Array.isArray(value)) {
      const list = value
        .map((v) => Number(v))
        .filter((n) => !isNaN(n) && (n === 1 || n === 2))
        .join(", ");
      if (!list) return "TRUE";
      return `${semExpr} IN (${list})`;
    }
    const s = Number(value);
    if (isNaN(s) || (s !== 1 && s !== 2)) return "TRUE";
    return `${semExpr} = ${s}`;
  }
  if (op === "YEAR_MONTH") {
    return buildMonthFilterSqlClause(fieldExpression, value);
  }

  if (op === "=" && isYearLikeValue(value)) {
    return `EXTRACT(YEAR FROM ${fieldExpression}) = ${Number(value)}`;
  }
  if (op === "IN" && Array.isArray(value) && value.length > 0 && isYearLikeValue(value)) {
    const yearList = value
      .map((v) => Number(v))
      .filter((n) => !isNaN(n) && n >= 1900 && n <= 2100)
      .join(", ");
    if (yearList) return `EXTRACT(YEAR FROM ${fieldExpression}) IN (${yearList})`;
  }

  if (op === "IN") {
    const list = (Array.isArray(value) ? value : value != null && value !== "" ? [value] : [])
      .map((x) => toSqlLiteral(x))
      .join(", ");
    if (!list) return "TRUE";
    return `${fieldExpression} IN (${list})`;
  }
  if (op === "NOT IN" || op === "NOT_IN") {
    const list = (Array.isArray(value) ? value : value != null && value !== "" ? [value] : [])
      .map((x) => toSqlLiteral(x))
      .join(", ");
    if (!list) return "TRUE";
    return `${fieldExpression} NOT IN (${list})`;
  }
  if (op === "BETWEEN") {
    let from: unknown;
    let to: unknown;
    if (Array.isArray(value)) [from, to] = value;
    else if (value && typeof value === "object") {
      from = (value as { from?: unknown; start?: unknown }).from ?? (value as { start?: unknown }).start;
      to = (value as { to?: unknown; end?: unknown }).to ?? (value as { end?: unknown }).end;
    }
    return `${fieldExpression} BETWEEN ${toSqlLiteral(from)} AND ${toSqlLiteral(to)}`;
  }
  if ((op === "IS" || op === "IS NOT") && (value === null || value === undefined)) {
    return `${fieldExpression} ${op} NULL`;
  }

  if (op === "EXACT") {
    return `${fieldExpression}::text = ${toSqlLiteral(String(value ?? ""))}`;
  }

  // Patrones de texto
  if (TEXT_PATTERN_OPS.has(op) || op === "LIKE" || op === "ILIKE") {
    const raw = String(value ?? "");
    const textExpr = `(${fieldExpression})::text`;
    if (op === "CONTAINS") {
      const pat = escapeSqlLikePattern(raw);
      return `${textExpr} ILIKE ${toSqlLiteral(`%${pat}%`)} ESCAPE '\\'`;
    }
    if (op === "NOT_CONTAINS" || op === "DOES_NOT_CONTAIN") {
      const pat = escapeSqlLikePattern(raw);
      return `(${textExpr} IS NULL OR ${textExpr} NOT ILIKE ${toSqlLiteral(`%${pat}%`)} ESCAPE '\\')`;
    }
    if (op === "STARTS_WITH") {
      const pat = escapeSqlLikePattern(raw);
      return `${textExpr} ILIKE ${toSqlLiteral(`${pat}%`)} ESCAPE '\\'`;
    }
    if (op === "ENDS_WITH") {
      const pat = escapeSqlLikePattern(raw);
      return `${textExpr} ILIKE ${toSqlLiteral(`%${pat}`)} ESCAPE '\\'`;
    }
    // LIKE / ILIKE: si el usuario no puso comodines, coincidencia exacta (case-insensitive para ILIKE).
    return `${textExpr} ${op} ${toSqlLiteral(raw)}`;
  }

  // Comparaciones numéricas: castear la columna para que "Mayor/Menor que" funcionen en text.
  if (COMPARISON_OPS.has(op) || filter.cast === "numeric") {
    const n = parseFilterNumericValue(value);
    if (COMPARISON_OPS.has(op) && n != null) {
      return `${safeNumericCast(fieldExpression)} ${op} ${n}`;
    }
    if (filter.cast === "numeric" && COMPARISON_OPS.has(op)) {
      const fallback = parseFilterNumericValue(value);
      if (fallback != null) return `${safeNumericCast(fieldExpression)} ${op} ${fallback}`;
    }
  }

  // Distinto: IS DISTINCT FROM contempla NULL y evita el error de tipos text/number.
  if (INEQUALITY_OPS.has(op)) {
    const n = parseFilterNumericValue(value);
    if (n != null || filter.cast === "numeric") {
      const num = n ?? Number(value);
      if (Number.isFinite(num)) {
        return `${safeNumericCast(fieldExpression)} IS DISTINCT FROM ${num}`;
      }
    }
    return `(${fieldExpression})::text IS DISTINCT FROM ${toSqlLiteral(String(value ?? ""))}`;
  }

  // Igualdad: comparar como texto por defecto (compatible con columnas text del ETL).
  if (op === "=") {
    if (useDateExprForYearLike) {
      return `EXTRACT(YEAR FROM ${fieldExpression}) = ${Number(value)}`;
    }
    return `(${fieldExpression})::text = ${toSqlLiteral(String(value ?? ""))}`;
  }

  // Fallback seguro
  return `${fieldExpression} ${op} ${toSqlLiteral(value)}`;
}
