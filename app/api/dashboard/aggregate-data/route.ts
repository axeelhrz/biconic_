// src/app/api/dashboard/aggregate-data/route.ts

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import postgres from "postgres";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { formatDateByGranularity, parseDateLike, type DateGranularity } from "@/lib/dashboard/dateFormatting";
import { buildMonthFilterSqlClause } from "@/lib/dashboard/monthFilterSql";
import {
  coerceGeoComponentOverrides,
  coerceGeoOverridesByXLabel,
  enrichRowsWithGeo,
  type GeoCacheClient,
  type GeoComponentOverrides,
  type GeoHints,
} from "@/lib/geo/geo-enrichment";

// --- Interfaces ---
interface MetricCondition {
  field: string;
  operator: string;
  value: any;
}

interface Metric {
  field: string;
  func: string;
  alias: string;
  cast?: "numeric" | "sanitize";
  /** Condición: solo se agregan filas que cumplan (ej. estado = 'Aprobado'). */
  condition?: MetricCondition;
  /** Fórmula derivada que referencia otras métricas por alias interno (metric_0, metric_1...). Ej: "(metric_0 - metric_1) / NULLIF(metric_0, 0)". */
  formula?: string;
  /** Expresión sobre columnas de la tabla (ej. "CANTIDAD * PRECIO_UNITARIO"). Se agrega con func (SUM, AVG...). Permite * - + / ( ) y nombres de columna. */
  expression?: string;
}

interface Filter {
  field: string;
  operator: string;
  value: any;
  cast?: "numeric";
  /** Opcional: id del filtro global (ej. gf.id) para incluir en filterWarnings. */
  id?: string;
}

interface OrderBy {
  field: string;
  direction: "ASC" | "DESC";
}

/** Columna calculada (nombre + expresión sobre columnas + agregación por defecto). */
interface DerivedColumnRef {
  name: string;
  expression: string;
  defaultAggregation: string;
}

interface AggregationRequest {
  tableName: string;
  dimension?: string;
  /** Múltiples dimensiones (ej. mes + categoría). Se hace GROUP BY todas. */
  dimensions?: string[];
  metrics: Metric[];
  /** Columnas calculadas enviadas por el cliente. Se fusionan con las de la DB. */
  derivedColumns?: DerivedColumnRef[];
  /** ID del ETL para resolver columnas calculadas desde la DB (fallback automático). */
  etlId?: string;
  filters?: Filter[];
  orderBy?: OrderBy;
  limit?: number;
  /** Si true, no se aplica LIMIT (hasta un tope de seguridad). Para vista previa con todas las filas. */
  unlimited?: boolean;
  cumulative?: "none" | "running_sum" | "ytd";
  comparePeriod?: "previous_year" | "previous_month";
  /** Comparación contra un valor fijo: agrega columnas alias_vs_fijo y alias_var_pct_fijo. */
  compareFixedValue?: number;
  dateDimension?: string;
  /** Agrupación temporal: aplica DATE_TRUNC(granularity, campo) como primera dimensión (semester vía expresión). */
  dateGroupBy?: { field: string; granularity: "day" | "week" | "month" | "quarter" | "semester" | "year" };
  /** Filtro de rango temporal: último N (last/unit) o rango personalizado (from/to). */
  dateRangeFilter?: { field: string; last?: number; unit?: "days" | "months"; from?: string; to?: string };
  /** Definiciones de métricas guardadas enviadas por el cliente para resolver por nombre (evita depender solo del ETL lookup). */
  savedMetrics?: Array<{ name: string; field?: string; func?: string; alias?: string; expression?: string }>;
  chartType?: string;
  chartXAxis?: string;
  geoHints?: GeoHints;
  /** País por defecto para geocodificación cuando la fila no incluye país. */
  mapDefaultCountry?: string;
  geoComponentOverrides?: GeoComponentOverrides;
  geoOverridesByXLabel?: Record<string, GeoComponentOverrides>;
}

// --- Constantes ---
const ALLOWED_AGG_FUNCTIONS = [
  "SUM",
  "AVG",
  "COUNT",
  "MIN",
  "MAX",
  "COUNT(DISTINCT",
];
const ALLOWED_OPERATORS = new Set([
  "=",
  "!=",
  "<>",
  ">",
  ">=",
  "<",
  "<=",
  "ILIKE",
  "LIKE",
  "IN",
  "BETWEEN",
  "IS",
  "IS NOT",
  "MONTH",
  "YEAR",
  "DAY",
  "QUARTER",
  "SEMESTER",
  "EXACT",
  "CONTAINS",
  "STARTS_WITH",
  "ENDS_WITH",
  "YEAR_MONTH",
]);

/** Obtiene nombres de columnas de la tabla desde information_schema. Devuelve null si falla o no hay SUPABASE_DB_URL. */
async function fetchTableColumnNames(schemaName: string, tableName: string): Promise<string[] | null> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) return null;
  const safeSchema = schemaName === "etl_output" ? "etl_output" : "public";
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() || "table";
  const sql = postgres(dbUrl);
  try {
    const rows = await sql.unsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      [safeSchema, safeTable]
    ) as Array<{ column_name?: string }>;
    await sql.end();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows.map((r) => String(r?.column_name ?? "").toLowerCase());
  } catch {
    try {
      await sql.end();
    } catch {
      /* ignore */
    }
    return null;
  }
}

function toSqlLiteral(v: any): string {
  if (v === null || typeof v === "undefined") return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

/** True si el valor es un año (4 dígitos, 1900–2100). Para arrays, true solo si todos los elementos son año. */
function isYearLike(value: any): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0 && value.every((v) => isYearLike(v));
  const s = String(value).trim();
  if (!/^\d{4}$/.test(s)) return false;
  const n = Number(s);
  return Number.isFinite(n) && n >= 1900 && n <= 2100;
}

const normalizeStr = (str: string) =>
  str ? str.replace(/\s+/g, "").toUpperCase() : "";

function isInvalidIdentifier(value: unknown): boolean {
  if (value == null) return true;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "" || normalized === "undefined" || normalized === "null";
}

/** Convierte nombre de columna del front (primary.COL, join_N.COL) al nombre físico en la tabla ETL (primary_col, join_n_col). */
function displayColumnToPhysical(name: string): string {
  let n = (name || "").trim();
  if (n.length >= 2 && n.startsWith('"') && n.endsWith('"'))
    n = n.slice(1, -1).replace(/""/g, '"');
  if (/^primary\.[a-zA-Z_][a-zA-Z0-9_]*$/i.test(n))
    return "primary_" + n.slice(8).replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  const joinMatch = n.match(/^join_(\d+)\.[a-zA-Z_][a-zA-Z0-9_]*$/i);
  if (joinMatch)
    return `join_${joinMatch[1]}_` + n.slice(joinMatch[0].indexOf(".") + 1).replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  return n.replace(/"/g, '""').toLowerCase();
}

/** En Postgres los identificadores sin comillas se guardan en minúsculas; normalizar para que "ID" coincida con "id". */
function quotedColumn(name: string): string {
  const physical = displayColumnToPhysical(name);
  const s = physical.replace(/"/g, '""').toLowerCase();
  return s ? `"${s}"` : '""';
}

/** Cast a numérico que devuelve NULL si el valor no es un número válido (evita "invalid input syntax for type numeric"). */
function safeNumericCast(expr: string): string {
  const e = expr.trim();
  const pattern = "'^[[:space:]]*[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?[[:space:]]*$'";
  return `(CASE WHEN (${e})::text ~ ${pattern} THEN ((${e})::text)::numeric ELSE NULL END)`;
}

/** Parseo robusto de fechas para columnas texto/date/timestamp. Soporta DD/MM/YYYY y YYYY-MM-DD (con o sin hora). */
function safeDateCast(expr: string): string {
  const e = expr.trim();
  return `(
    CASE
      WHEN ${e} IS NULL THEN NULL
      WHEN trim((${e})::text) ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(trim((${e})::text), 'DD/MM/YYYY')
      WHEN trim((${e})::text) ~ '^\\d{1,2}-\\d{1,2}-\\d{4}$' THEN to_date(trim((${e})::text), 'DD-MM-YYYY')
      WHEN trim((${e})::text) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN to_date(trim((${e})::text), 'YYYY-MM-DD')
      WHEN trim((${e})::text) ~ '^\\d{4}-\\d{2}-\\d{2}[ T].*$' THEN (trim((${e})::text))::timestamp::date
      WHEN (${e})::text LIKE '%, % de % de %' THEN to_date((${e})::text, 'Day, DD "de" Month "de" YYYY')
      ELSE NULL
    END
  )`;
}

const SQL_KNOWN_FUNCTIONS = new Set([
  "SUM", "AVG", "AVERAGE", "COUNT", "MIN", "MAX", "COUNTA", "UNIQUE", "COUNTIF", "SUMIF", "AVERAGEIF", "COUNTIFS", "SUMIFS",
  "NULLIF", "COALESCE", "ABS", "ROUND", "ROUNDUP", "ROUNDDOWN", "CEIL", "CEILING", "FLOOR", "TRUNC", "GREATEST", "LEAST",
  "MOD", "POWER", "SQRT", "SIGN", "EXP", "LN", "LOG", "LOG10", "PI",
  "SIN", "COS", "TAN", "FLOOR", "INT",
  "CASE", "WHEN", "THEN", "ELSE", "END",
  "IF", "IFS", "IFERROR", "IFNA", "AND", "OR", "NOT", "TRUE", "FALSE",
  "UPPER", "LOWER", "TRIM", "LENGTH", "LEN", "LEFT", "RIGHT", "SUBSTRING", "MID", "CONCAT", "CONCATENATE", "REPLACE", "SUBSTITUTE",
  "DATE", "TODAY", "NOW", "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND", "EOMONTH", "DATEDIF", "DATEVALUE", "TIMEVALUE",
  "VALUE", "TEXT", "REPT", "FIND", "SEARCH", "PROPER",
]);

/** Verifica paréntesis balanceados (ignora los que están dentro de comillas). Devuelve mensaje de error o null si está bien. */
function checkBalancedParens(expr: string): string | null {
  let depth = 0;
  let inQuote: string | null = null;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (inQuote) {
      if (c === inQuote && expr[i - 1] !== "\\") inQuote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      inQuote = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth < 0) return "Paréntesis de cierre ) sin apertura.";
    }
  }
  if (depth !== 0) return "Faltan paréntesis de cierre.";
  return null;
}

/** Convierte IF(cond, thenVal, elseVal) en CASE WHEN cond THEN thenVal ELSE elseVal END (soporta anidamiento por profundidad de paréntesis). */
function expandIfToCaseWhen(expr: string): string {
  const trimmed = expr.trim();
  const ifStart = trimmed.search(/\bIF\s*\(/i);
  if (ifStart === -1) return expr;
  const start = trimmed.indexOf("(", ifStart);
  if (start === -1) return expr;
  let depth = 1;
  let firstComma = -1;
  let secondComma = -1;
  let i = start + 1;
  for (; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) break;
    } else if ((c === "," || c === ";") && depth === 1) {
      if (firstComma === -1) firstComma = i;
      else {
        secondComma = i;
        break;
      }
    }
  }
  if (firstComma === -1 || secondComma === -1) return expr;
  const cond = trimmed.slice(start + 1, firstComma).trim();
  const thenVal = trimmed.slice(firstComma + 1, secondComma).trim();
  const elseVal = trimmed.slice(secondComma + 1, i).trim();
  const caseExpr = `(CASE WHEN ${expandIfToCaseWhen(cond)} THEN ${expandIfToCaseWhen(thenVal)} ELSE ${expandIfToCaseWhen(elseVal)} END)`;
  return trimmed.slice(0, ifStart) + caseExpr + trimmed.slice(i + 1);
}

/** Extrae el contenido entre paréntesis balanceados a partir de start (el índice del "("). Devuelve { inner, endIndex }. */
function extractParenContent(s: string, start: number): { inner: string; endIndex: number } | null {
  if (s[start] !== "(") return null;
  let depth = 1;
  let i = start + 1;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return { inner: s.slice(start + 1, i).trim(), endIndex: i };
    }
  }
  return null;
}

/** Convierte IFS(cond1, val1, cond2, val2, ..., [default]) en CASE WHEN ... END. */
function expandIfsToCaseWhen(expr: string): string {
  const trimmed = expr.trim();
  const ifsStart = trimmed.search(/\bIFS\s*\(/i);
  if (ifsStart === -1) return expr;
  const start = trimmed.indexOf("(", ifsStart);
  const extracted = extractParenContent(trimmed, start);
  if (!extracted) return expr;
  const args = splitArgs(extracted.inner);
  if (args.length < 2) return expr;
  const pairs: { cond: string; val: string }[] = [];
  let i = 0;
  while (i + 1 < args.length) {
    pairs.push({ cond: args[i]!, val: args[i + 1]! });
    i += 2;
  }
  const defaultVal = i < args.length ? args[i] : "NULL";
  const whenParts = pairs.map((p) => `WHEN ${expandIfsToCaseWhen(p.cond)} THEN ${expandIfsToCaseWhen(p.val)}`).join(" ");
  const caseExpr = `(CASE ${whenParts} ELSE ${expandIfsToCaseWhen(defaultVal)} END)`;
  return trimmed.slice(0, ifsStart) + caseExpr + trimmed.slice(extracted.endIndex + 1);
}

/** Convierte AND(a, b, ...) en (a AND b AND ...). */
function expandAndOr(expr: string, fn: "AND" | "OR"): string {
  const regex = new RegExp(`\\b${fn}\\s*\\(`, "gi");
  const match = expr.match(regex);
  if (!match) return expr;
  const first = expr.search(regex);
  const start = expr.indexOf("(", first);
  const extracted = extractParenContent(expr, start);
  if (!extracted) return expr;
  const args = splitArgs(extracted.inner);
  const op = fn === "AND" ? " AND " : " OR ";
  const joined = args.map((a) => (fn === "AND" ? expandAndOr(a, "AND") : expandAndOr(a, "OR"))).join(op);
  const repl = `(${joined})`;
  return expr.slice(0, first) + repl + expr.slice(extracted.endIndex + 1);
}

/** Convierte expresión sobre columnas (ej. "CANTIDAD * PRECIO_UNITARIO", IF(ESTADO='PAGADO',1,0)) en SQL seguro.
 *  - Literales numéricos y cadenas entre comillas se preservan.
 *  - ; se normaliza a , (estilo Excel).
 *  - AVERAGE( -> AVG(, LEN( -> LENGTH(, MID( -> SUBSTRING(.
 *  - IF(cond, then, else) se convierte en CASE WHEN ... THEN ... ELSE ... END.
 *  - Funciones SQL conocidas se preservan.
 *  - Nombres de columnas calculadas (derivedLookup) se expanden a su expresión.
 *  - Demás identificadores se pasan a quotedColumn.
 */
function expressionToSql(expression: string, derivedLookup?: Record<string, DerivedColumnRef>, _depth = 0): string | null {
  if (!expression || typeof expression !== "string") return null;
  let s = expression.replace(/\s+/g, " ").trim();
  if (!s) return null;
  // Normalizar comillas tipográficas/Unicode a comillas rectas (evita fallos con IF(primary.X="FB";...))
  s = s.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"').replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'");
  // Permitir literales: números, cadenas con ' o ", ^ para potencia, = <> ! para comparaciones (IF, COUNTIF, etc.)
  const allowed = /^[a-zA-Z0-9_*+\-/().,\s'"%;^=<>!]+$/;
  if (!allowed.test(s)) return null;

  // 0) Normalizar ; a , (Excel usa ; como separador de argumentos)
  s = s.replace(/;/g, ",");

  // 1) Proteger cadenas entre comillas (simple o doble) para no tocar su contenido
  const stringLiterals: string[] = [];
  s = s.replace(/'([^']*)'|"([^"]*)"/g, (_, single, double) => {
    const content = single !== undefined ? single : double;
    const idx = stringLiterals.length;
    stringLiterals.push(content.replace(/'/g, "''"));
    return `__STR${idx}__`;
  });

  // 1b) Alias Excel -> SQL: AVERAGE( -> AVG(, LEN( -> LENGTH(, MID( -> SUBSTRING(, CONCATENATE( -> CONCAT(
  s = s.replace(/\bAVERAGE\s*\(/gi, "AVG(");
  s = s.replace(/\bLEN\s*\(/gi, "LENGTH(");
  s = s.replace(/\bMID\s*\(/gi, "SUBSTRING(");
  s = s.replace(/\bCONCATENATE\s*\(/gi, "CONCAT(");

  // 1c) Potencia: token ^ token -> POWER(token, token)
  s = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*|\d+\.?\d*|__STR\d+__)\s+\^\s+([a-zA-Z_][a-zA-Z0-9_]*|\d+\.?\d*|__STR\d+__)\b/g, (_, a, b) => `POWER(${a},${b})`);

  // 2) Expandir IF(cond, then, else) a CASE WHEN
  while (/IF\s*\(/i.test(s) && !/IFS\s*\(/i.test(s)) {
    const next = expandIfToCaseWhen(s);
    if (next === s) break;
    s = next;
  }
  while (/\bIFS\s*\(/i.test(s)) {
    const next = expandIfsToCaseWhen(s);
    if (next === s) break;
    s = next;
  }
  while (/\bAND\s*\(/i.test(s)) {
    const next = expandAndOr(s, "AND");
    if (next === s) break;
    s = next;
  }
  while (/\bOR\s*\(/i.test(s)) {
    const next = expandAndOr(s, "OR");
    if (next === s) break;
    s = next;
  }

  // 2b) COUNTA(UNIQUE(expr)) -> COUNT(DISTINCT expr) (caso Rumipal)
  while (/COUNTA\s*\(\s*UNIQUE\s*\(/i.test(s)) {
    const match = s.match(/COUNTA\s*\(\s*UNIQUE\s*\(/i);
    if (!match) break;
    const start = s.indexOf(match[0]!);
    const openParen = s.indexOf("(", s.indexOf("UNIQUE", start));
    const extracted = extractParenContent(s, openParen);
    if (!extracted) break;
    const inner = extracted.inner;
    const countDistinctEnd = s.indexOf(")", extracted.endIndex + 1);
    if (countDistinctEnd === -1) break;
    const innerSql = expressionToSql(inner, derivedLookup, _depth + 1);
    if (!innerSql) break;
    const repl = `COUNT(DISTINCT ${innerSql})`;
    s = s.slice(0, start) + repl + s.slice(countDistinctEnd + 1);
  }
  // 2c) COUNTA(expr) -> COUNT(expr) (contar no vacíos = COUNT en SQL)
  s = s.replace(/\bCOUNTA\s*\(/gi, "COUNT(");

  // 3) Reemplazar identificadores (columnas/funciones). Primero prefijos join (primary.X, join_N.X) como un solo identificador para no interpretar "primary" como tabla.
  const out = s.replace(/\b(primary\.[a-zA-Z_][a-zA-Z0-9_]*|join_\d+\.[a-zA-Z_][a-zA-Z0-9_]*|[a-zA-Z_][a-zA-Z0-9_]*)\b/g, (id: string) => {
    if (/^__STR\d+__$/.test(id)) return id;
    if (/^\d+\.?\d*$/.test(id)) return id; // literal numérico
    if (SQL_KNOWN_FUNCTIONS.has(id.toUpperCase())) return id.toUpperCase();
    if (derivedLookup && _depth < 5 && !/\./.test(id)) {
      const ref = derivedLookup[id.toLowerCase()];
      if (ref?.expression) {
        const inner = expressionToSql(ref.expression, derivedLookup, _depth + 1);
        if (inner) return `(${inner})`;
      }
    }
    return quotedColumn(id);
  });

  // 4) Restaurar cadenas como literales SQL (siempre comilla simple)
  const withStrings = out.replace(/__STR(\d+)__/g, (_, i) => {
    const content = stringLiterals[Number(i)] ?? "";
    return `'${content}'`;
  });

  return withStrings || null;
}

/** Devuelve el índice de la ")" que cierra la "(" en openParenIndex, respetando paréntesis anidados y comillas. */
function findMatchingCloseParen(expr: string, openParenIndex: number): number {
  let depth = 1;
  let inQuote: string | null = null;
  for (let i = openParenIndex + 1; i < expr.length; i++) {
    const c = expr[i];
    if (inQuote) {
      if (c === inQuote && expr[i - 1] !== "\\") inQuote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      inQuote = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Encuentra el índice del operador "/" de división a nivel top (depth 0), respetando paréntesis y comillas. Devuelve -1 si no hay ninguno. */
function findTopLevelDivision(expr: string): number {
  let depth = 0;
  let inQuote: string | null = null;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (inQuote) {
      if (c === inQuote && expr[i - 1] !== "\\") inQuote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      inQuote = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "/" && depth === 0) return i;
  }
  return -1;
}

/** Si la expresión es un ratio (num/den a nivel top), devuelve { numerator, denominator }. Usado para generar SUM(num)/NULLIF(SUM(den),0) en lugar de SUM(num/den). */
function parseRatioExpression(expr: string): { numerator: string; denominator: string } | null {
  const s = expr.replace(/\s+/g, " ").trim();
  const idx = findTopLevelDivision(s);
  if (idx <= 0 || idx >= s.length - 1) return null;
  const numerator = s.slice(0, idx).trim();
  const denominator = s.slice(idx + 1).trim();
  if (!numerator || !denominator) return null;
  return { numerator, denominator };
}

/** Si la expresión está envuelta en una función de agregación (ej. "SUM(X * Y)", "AVERAGE(X)"), devuelve { func, inner }.
 *  Solo desempaqueta cuando toda la expresión es exactamente una llamada (paréntesis balanceados); p. ej. "SUM(a)/SUM(b)" no se desempaqueta. */
function unwrapAggExpression(expr: string): { func: string; inner: string } | null {
  const s = expr.trim();
  const headMatch = s.match(/^(SUM|AVG|AVERAGE|COUNT|COUNTA|MIN|MAX)\s*\(/i);
  if (!headMatch) return null;
  const openParenIndex = headMatch.index! + headMatch[0].length - 1;
  const closeParenIndex = findMatchingCloseParen(s, openParenIndex);
  if (closeParenIndex === -1) return null;
  const afterClose = s.slice(closeParenIndex + 1).trim();
  if (afterClose.length > 0) return null;
  const inner = s.slice(openParenIndex + 1, closeParenIndex).trim();
  let func = headMatch[1]!.toUpperCase();
  if (func === "AVERAGE") func = "AVG";
  if (func === "COUNTA") func = "COUNT";
  return { func, inner };
}

/** Divide el contenido de argumentos por comas respetando paréntesis y comillas. */
function splitArgs(content: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inQuote: string | null = null;
  let start = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuote) {
      if (c === inQuote && content[i - 1] !== "\\") inQuote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      inQuote = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === "," || c === ";") && depth === 0) {
      args.push(content.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (start <= content.length) args.push(content.slice(start).trim());
  return args.filter(Boolean);
}

/** Parsea criterio tipo ">10", "=Activo", "<>" y devuelve { op, valueStr }. */
function parseCriterion(crit: string): { op: string; valueStr: string } {
  const t = crit.trim();
  const match = t.match(/^(\<\>|\>\=|\<\=|\>|\<|\=)?\s*([\s\S]*)$/);
  const op = (match?.[1] ?? "=").replace(/\s/g, "");
  const valueStr = (match?.[2] ?? t).trim();
  return { op: op || "=", valueStr };
}

/** Construye la expresión SQL de agregación para COUNTIF/SUMIF/COUNTIFS/SUMIFS. Devuelve null si no aplica. */
function buildCountIfSumIfAggregate(
  expression: string,
  derivedLookup: Record<string, DerivedColumnRef> | undefined
): string | null {
  const trimmed = expression.replace(/\s+/g, " ").trim().replace(/;/g, ",");
  const countIfMatch = trimmed.match(/^\s*COUNTIF\s*\(([\s\S]+)\)\s*$/i);
  if (countIfMatch) {
    const args = splitArgs(countIfMatch[1]!);
    if (args.length < 2) return null;
    const rangeSql = expressionToSql(args[0]!, derivedLookup);
    const crit = parseCriterion(args[1]!);
    const valSql = expressionToSql(args[1]!, derivedLookup) ?? toSqlLiteral(crit.valueStr.replace(/^['"]|['"]$/g, ""));
    if (!rangeSql) return null;
    const whenClause = crit.op === "=" ? `${rangeSql} = ${valSql}` : crit.op === "<>" || crit.op === "!=" ? `${rangeSql} <> ${valSql}` : `${rangeSql} ${crit.op} ${valSql}`;
    return `COUNT(CASE WHEN ${whenClause} THEN 1 END)`;
  }
  const sumIfMatch = trimmed.match(/^\s*SUMIF\s*\(([\s\S]+)\)\s*$/i);
  if (sumIfMatch) {
    const args = splitArgs(sumIfMatch[1]!);
    if (args.length < 2) return null;
    const rangeSql = expressionToSql(args[0]!, derivedLookup);
    const crit = parseCriterion(args[1]!);
    const valSql = expressionToSql(args[1]!, derivedLookup) ?? toSqlLiteral(crit.valueStr.replace(/^['"]|['"]$/g, ""));
    const whenClause = crit.op === "=" ? `${rangeSql} = ${valSql}` : crit.op === "<>" || crit.op === "!=" ? `${rangeSql} <> ${valSql}` : `${rangeSql} ${crit.op} ${valSql}`;
    const sumRangeSql = args.length >= 3 ? expressionToSql(args[2]!, derivedLookup) : rangeSql;
    if (!rangeSql || !sumRangeSql) return null;
    return `SUM(CASE WHEN ${whenClause} THEN ${sumRangeSql} ELSE 0 END)`;
  }
  const countIfsMatch = trimmed.match(/^\s*COUNTIFS\s*\(([\s\S]+)\)\s*$/i);
  if (countIfsMatch) {
    const args = splitArgs(countIfsMatch[1]!);
    if (args.length < 2 || args.length % 2 !== 0) return null;
    const conditions: string[] = [];
    for (let i = 0; i < args.length; i += 2) {
      const rangeSql = expressionToSql(args[i]!, derivedLookup);
      const crit = parseCriterion(args[i + 1]!);
      const valSql = expressionToSql(args[i + 1]!, derivedLookup) ?? toSqlLiteral(crit.valueStr.replace(/^['"]|['"]$/g, ""));
      if (!rangeSql) return null;
      const whenClause = crit.op === "=" ? `${rangeSql} = ${valSql}` : crit.op === "<>" || crit.op === "!=" ? `${rangeSql} <> ${valSql}` : `${rangeSql} ${crit.op} ${valSql}`;
      conditions.push(whenClause);
    }
    return `COUNT(CASE WHEN ${conditions.join(" AND ")} THEN 1 END)`;
  }
  const sumIfsMatch = trimmed.match(/^\s*SUMIFS\s*\(([\s\S]+)\)\s*$/i);
  if (sumIfsMatch) {
    const args = splitArgs(sumIfsMatch[1]!);
    if (args.length < 3 || (args.length - 1) % 2 !== 0) return null;
    const sumRangeSql = expressionToSql(args[0]!, derivedLookup);
    if (!sumRangeSql) return null;
    const conditions: string[] = [];
    for (let i = 1; i < args.length; i += 2) {
      const rangeSql = expressionToSql(args[i]!, derivedLookup);
      const crit = parseCriterion(args[i + 1]!);
      const valSql = expressionToSql(args[i + 1]!, derivedLookup) ?? toSqlLiteral(crit.valueStr.replace(/^['"]|['"]$/g, ""));
      if (!rangeSql) return null;
      const whenClause = crit.op === "=" ? `${rangeSql} = ${valSql}` : crit.op === "<>" || crit.op === "!=" ? `${rangeSql} <> ${valSql}` : `${rangeSql} ${crit.op} ${valSql}`;
      conditions.push(whenClause);
    }
    return `SUM(CASE WHEN ${conditions.join(" AND ")} THEN ${sumRangeSql} ELSE 0 END)`;
  }
  const averageIfMatch = trimmed.match(/^\s*AVERAGEIF\s*\(([\s\S]+)\)\s*$/i);
  if (averageIfMatch) {
    const args = splitArgs(averageIfMatch[1]!);
    if (args.length < 2) return null;
    const rangeSql = expressionToSql(args[0]!, derivedLookup);
    const crit = parseCriterion(args[1]!);
    const valSql = expressionToSql(args[1]!, derivedLookup) ?? toSqlLiteral(crit.valueStr.replace(/^['"]|['"]$/g, ""));
    const whenClause = crit.op === "=" ? `${rangeSql} = ${valSql}` : crit.op === "<>" || crit.op === "!=" ? `${rangeSql} <> ${valSql}` : `${rangeSql} ${crit.op} ${valSql}`;
    const avgRangeSql = args.length >= 3 ? expressionToSql(args[2]!, derivedLookup) : rangeSql;
    if (!rangeSql || !avgRangeSql) return null;
    return `AVG(CASE WHEN ${whenClause} THEN ${avgRangeSql} END)`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    let body: AggregationRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Cuerpo de la petición inválido (JSON esperado)" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Cuerpo de la petición inválido" },
        { status: 400 }
      );
    }
    const requestedChartType = String(body.chartType ?? "").trim().toLowerCase();

    if (!Array.isArray(body.metrics) || body.metrics.length === 0) {
      return NextResponse.json(
        { error: "Se requiere al menos una métrica (metrics)" },
        { status: 400 }
      );
    }
    const invalidDimensions = [
      ...(Array.isArray(body.dimensions) ? body.dimensions : []),
      body.dimension,
      body.dateDimension,
      body.chartXAxis,
      body.dateGroupBy?.field,
      body.dateRangeFilter?.field,
    ].filter((value) => value !== undefined && isInvalidIdentifier(value));
    if (invalidDimensions.length > 0) {
      return NextResponse.json(
        { error: "Hay dimensiones/campos inválidos en la configuración (valor vacío, undefined o null)." },
        { status: 400 }
      );
    }
    for (let i = 0; i < body.metrics.length; i++) {
      const metric = body.metrics[i];
      if (metric.formula) continue;
      if (isInvalidIdentifier(metric.field) && !String(metric.expression ?? "").trim()) {
        return NextResponse.json(
          { error: `Métrica en posición ${i + 1}: field inválido (vacío, undefined o null).` },
          { status: 400 }
        );
      }
    }

    // Validar que cada métrica base use una función de agregación permitida (o expresión con COUNTIF/SUMIF/etc.)
    const allowedAggSet = new Set(ALLOWED_AGG_FUNCTIONS.map((f) => f.toUpperCase()));
    const allowedAggWhenExpression = new Set(["COUNTIF", "SUMIF", "COUNTIFS", "SUMIFS", "AVERAGEIF"]);
    for (let i = 0; i < body.metrics.length; i++) {
      const m = body.metrics[i];
      if (m.formula) continue;
      const func = (m.func || "").toString().toUpperCase().trim();
      const expr = (m as Metric & { expression?: string }).expression?.trim() ?? "";
      const exprIsCountIfSumIf = /^\s*(COUNTIF|SUMIF|COUNTIFS|SUMIFS|AVERAGEIF)\s*\(/i.test(expr);
      const allowed =
        allowedAggSet.has(func) ||
        func.startsWith("COUNT(DISTINCT") ||
        func === "COUNTA" ||
        allowedAggWhenExpression.has(func) ||
        exprIsCountIfSumIf;
      if (!allowed) {
        return NextResponse.json(
          { error: `Métrica en posición ${i + 1}: función "${m.func}" no permitida. Use: SUM, AVG, COUNT, COUNTA, MIN, MAX, COUNT(DISTINCT), o expresiones con COUNTIF/SUMIF/COUNTIFS/SUMIFS/AVERAGEIF.` },
          { status: 400 }
        );
      }
    }

    const cookieStore = await cookies();

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session)
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    // Permitir etl_output.* y public.* (legacy etl_data_warehouse u otras tablas)
    const allowedPrefixes = ["etl_output.", "public."];
    if (!body.tableName || typeof body.tableName !== "string" || !allowedPrefixes.some((p) => body.tableName.startsWith(p))) {
      return NextResponse.json(
        { error: "Nombre de tabla inválido o no permitido. Use esquema etl_output o public." },
        { status: 400 }
      );
    }

    // Soporte para nombres de tabla con punto: solo dividir en el primer "."
    const dotIdx = body.tableName.indexOf(".");
    const schema = body.tableName.substring(0, dotIdx);
    const table = body.tableName.substring(dotIdx + 1);
    if (!table) {
      return NextResponse.json(
        { error: "Formato de tabla inválido (debe ser esquema.nombre_tabla)" },
        { status: 400 }
      );
    }

    // Filtros inteligentes: validar que cada filtro tenga su columna en la tabla; omitir los que no y devolver filterWarnings
    const tableColumnNames = await fetchTableColumnNames(schema, table);
    const tableColumnsSet = tableColumnNames ? new Set(tableColumnNames) : null;
    const filterWarnings: Array<{ filterId?: string; field: string; reason: string }> = [];
    const validFilters: Filter[] = [];
    if (body.filters && body.filters.length > 0) {
      for (const f of body.filters) {
        const fieldNorm = (f.field || "").replace(/"/g, "").trim().toLowerCase();
        if (tableColumnsSet && fieldNorm && !tableColumnsSet.has(fieldNorm)) {
          filterWarnings.push({
            filterId: (f as Filter & { id?: string }).id,
            field: f.field,
            reason: "column_not_in_table",
          });
        } else {
          validFilters.push(f);
        }
      }
    } else {
      validFilters.push(...(body.filters || []));
    }

    // Helper: condición WHEN para métrica (solo la parte "campo op valor")
    const buildWhenClause = (cond: MetricCondition): string => {
      const op = (cond.operator || "=").toUpperCase().trim();
      const f = quotedColumn(cond.field);
      if (op === "IN") {
        const list = (Array.isArray(cond.value) ? cond.value : [cond.value])
          .map((x: any) => toSqlLiteral(x))
          .join(", ");
        return `${f} IN (${list})`;
      }
      if ((op === "IS" || op === "IS NOT") && cond.value == null) return `${f} ${op} NULL`;
      return `${f} ${op} ${toSqlLiteral(cond.value)}`;
    };
    const buildConditionExpr = (cond: MetricCondition, thenExpr: string): string =>
      `CASE WHEN ${buildWhenClause(cond)} THEN ${thenExpr} END`;

    // --- Resolver columnas derivadas: fusionar las del request con las de la DB ---
    const derivedByName: Record<string, DerivedColumnRef> = {};

    const addDerivedFromArray = (arr: unknown[]) => {
      for (const d of arr) {
        const item = d as Record<string, unknown>;
        const name = String(item?.name ?? "").trim();
        const expression = String(item?.expression ?? "").trim();
        if (!name || !expression) continue;
        const key = name.toLowerCase();
        if (!derivedByName[key]) {
          derivedByName[key] = {
            name,
            expression,
            defaultAggregation: String(item?.defaultAggregation ?? item?.default_aggregation ?? "SUM"),
          };
        }
      }
    };

    if (Array.isArray(body.derivedColumns)) addDerivedFromArray(body.derivedColumns);

    // Buscar en la DB: por etlId explícito, por output_table, o por etl_runs_log
    let etlIdForLookup: string | null = body.etlId ?? null;
    if (!etlIdForLookup && table) {
      const tbl = table.toLowerCase();
      const tableWithoutSchema = tbl.includes(".") ? tbl.split(".").slice(-1)[0] ?? tbl : tbl;
      try {
        const { data: etlByOutput } = await supabase
          .from("etl")
          .select("id")
          .ilike("output_table", tbl)
          .limit(1)
          .maybeSingle();
        if (etlByOutput?.id) etlIdForLookup = etlByOutput.id;
      } catch { /* ignore */ }
      if (!etlIdForLookup) {
        try {
          const { data: etlByOutputShort } = await supabase
            .from("etl")
            .select("id")
            .ilike("output_table", tableWithoutSchema)
            .limit(1)
            .maybeSingle();
          if (etlByOutputShort?.id) etlIdForLookup = etlByOutputShort.id;
        } catch { /* ignore */ }
      }
      if (!etlIdForLookup) {
        try {
          const { data: runRow } = await supabase
            .from("etl_runs_log")
            .select("etl_id")
            .eq("status", "completed")
            .ilike("destination_table_name", tbl)
            .order("completed_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (runRow?.etl_id) etlIdForLookup = runRow.etl_id;
        } catch { /* ignore */ }
      }
      if (!etlIdForLookup) {
        try {
          const { data: runRowShort } = await supabase
            .from("etl_runs_log")
            .select("etl_id")
            .eq("status", "completed")
            .ilike("destination_table_name", tableWithoutSchema)
            .order("completed_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (runRowShort?.etl_id) etlIdForLookup = runRowShort.etl_id;
        } catch { /* ignore */ }
      }
    }
    /** Por nombre de métrica guardada (ETL): field/expression/func para expandir cuando el request usa el nombre como "field". */
    const savedMetricByName: Record<string, { field: string; func: string; alias: string; expression?: string }> = {};
    if (etlIdForLookup) {
      try {
        const { data: etlRow } = await supabase
          .from("etl")
          .select("layout")
          .eq("id", etlIdForLookup)
          .maybeSingle();
        if (etlRow) {
          const layout = etlRow.layout as Record<string, unknown> | undefined;
          const cfg = (layout?.dataset_config ?? layout?.datasetConfig) as Record<string, unknown> | undefined;
          const raw = cfg?.derivedColumns ?? cfg?.derived_columns;
          if (Array.isArray(raw)) addDerivedFromArray(raw);
          const savedList = Array.isArray(layout?.saved_metrics) ? layout.saved_metrics : [];
          for (const sm of savedList) {
            const s = sm as { name?: string; metric?: { field?: string; func?: string; alias?: string; expression?: string }; aggregationConfig?: { metrics?: { field?: string; func?: string; alias?: string; expression?: string }[] } };
            const name = String(s?.name ?? "").trim().toLowerCase();
            if (!name) continue;
            const topMetric = s?.metric;
            const cfgMetrics = s?.aggregationConfig?.metrics;
            const firstMetric = Array.isArray(cfgMetrics) && cfgMetrics.length > 0 ? cfgMetrics[0] : topMetric;
            if (!firstMetric) continue;
            let field = String(firstMetric?.field ?? "").trim();
            const expression = (firstMetric as { expression?: string }).expression;
            const alias = String(firstMetric?.alias ?? name);
            if (field.toLowerCase() === name && !expression) {
              const byAlias = Array.isArray(cfgMetrics) && cfgMetrics.length > 0
                ? cfgMetrics.find((mm: any) => mm?.field && String(mm.field).trim().toLowerCase() !== name)
                : null;
              if (byAlias) {
                field = String((byAlias as { field?: string }).field ?? "").trim();
              } else {
                field = alias;
              }
              if (!field || field.toLowerCase() === name) {
                const agg = s?.aggregationConfig as { dimension?: string; dimension2?: string; dimensions?: string[] } | undefined;
                const dim = (agg?.dimension && String(agg.dimension).trim()) || (agg?.dimension2 && String(agg.dimension2).trim()) || (Array.isArray(agg?.dimensions) && agg.dimensions[0] && String(agg.dimensions[0]).trim()) || "";
                if (dim && dim.toLowerCase() !== name) field = dim;
              }
            }
            savedMetricByName[name] = {
              field,
              func: String(firstMetric?.func ?? "SUM").toUpperCase(),
              alias,
              ...(expression && String(expression).trim() && { expression: String(expression).trim() }),
            };
          }
        }
      } catch { /* ignore */ }
    }
    // Fusionar métricas guardadas enviadas en el body (prioridad al cliente para multi-ETL o cuando el lookup falla)
    if (Array.isArray(body.savedMetrics) && body.savedMetrics.length > 0) {
      for (const sm of body.savedMetrics) {
        const name = typeof sm?.name === "string" ? String(sm.name).trim() : "";
        if (!name) continue;
        const key = name.toLowerCase();
        const field = typeof sm.field === "string" ? String(sm.field).trim() : "";
        const func = typeof sm.func === "string" ? String(sm.func).toUpperCase() : "SUM";
        const alias = typeof sm.alias === "string" ? String(sm.alias).trim() : name;
        const expression = typeof sm.expression === "string" ? String(sm.expression).trim() : undefined;
        savedMetricByName[key] = {
          field: field || name,
          func,
          alias: alias || name,
          ...(expression ? { expression } : {}),
        };
      }
    }
    console.log("[aggregate-data] derivedByName keys:", Object.keys(derivedByName), "etlIdForLookup:", etlIdForLookup);

    const getDerived = (field: string | undefined): DerivedColumnRef | undefined => {
      if (!field || !String(field).trim()) return undefined;
      return derivedByName[String(field).trim().toLowerCase()];
    };

    const metricsBase = body.metrics.filter((m) => !m.formula);
    const metricsFormula = body.metrics.filter((m) => m.formula);

    for (let i = 0; i < metricsBase.length; i++) {
      const m = metricsBase[i];
      const derived: DerivedColumnRef | undefined = getDerived(m.field);
      const metricExpr = (m as Metric & { expression?: string }).expression;
      let expr = (metricExpr && metricExpr.trim()) ? metricExpr.trim() : (derived?.expression ?? null);
      if (expr) {
        const uw = unwrapAggExpression(expr);
        if (uw) expr = uw.inner;
      }
      if (expr != null && String(expr).trim() !== "") {
        const exprStr = String(expr).trim();
        const parenError = checkBalancedParens(exprStr);
        if (parenError) {
          return NextResponse.json(
            { error: `Métrica en posición ${i + 1}: ${parenError}` },
            { status: 400 }
          );
        }
        if (!expressionToSql(exprStr, derivedByName)) {
          return NextResponse.json(
            { error: `Métrica en posición ${i + 1}: la expresión no es válida. Revisá que solo uses columnas del dataset, números, operadores ( * - + / ^ ), comillas para texto, y funciones soportadas (IF, SUM, AVG, ROUND, UPPER, etc.).` },
            { status: 400 }
          );
        }
      } else if (!m.field || !String(m.field).trim()) {
        return NextResponse.json(
          { error: `Métrica en posición ${i + 1}: indicá una expresión (ej. CANTIDAD * PRECIO_UNITARIO) o un campo.` },
          { status: 400 }
        );
      } else if (!derived) {
        // field existe pero no es columna calculada: se usará como columna real
      }
    }

    // 1. Construcción de Métricas. Columnas calculadas: field -> expression + func. Si field es nombre de métrica guardada, expandir.
    const metricClauses = metricsBase
      .map((m) => {
        const i = body.metrics.indexOf(m);
        const derived: DerivedColumnRef | undefined = getDerived(m.field);
        const savedMetric = m.field && !derived ? savedMetricByName[String(m.field).trim().toLowerCase()] : undefined;

        // Resolver expresión: prioridad derived > metric.expression > métrica guardada por nombre (defensivo)
        let resolvedExpr = "";
        if (derived) {
          resolvedExpr = derived.expression;
        }
        const metricExpr = (m as Metric & { expression?: string }).expression;
        if (metricExpr && metricExpr.trim()) {
          resolvedExpr = metricExpr.trim();
        }
        if (!resolvedExpr && savedMetric?.expression) {
          resolvedExpr = savedMetric.expression;
        }

        // Si está envuelta en agregación, extraer. Detectar expresión compuesta (ej. SUM(a)/SUM(b)) para no envolver en func() después.
        let func = (m.func || derived?.defaultAggregation || savedMetric?.func || "SUM").toString().toUpperCase();
        let isCompoundAggregate = false;
        if (resolvedExpr) {
          const unwrapped = unwrapAggExpression(resolvedExpr);
          isCompoundAggregate = !unwrapped && /\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/i.test(resolvedExpr);
          if (unwrapped) {
            resolvedExpr = unwrapped.inner;
            if (!m.func || m.func === "SUM") func = unwrapped.func;
          }
        }

        // Campo efectivo: si no hay expresión y el field es una métrica guardada, usar el field de esa métrica
        const effectiveField = (!resolvedExpr && savedMetric?.field) ? savedMetric.field : m.field;
        const derivedForField = getDerived(effectiveField);
        if (!resolvedExpr && derivedForField?.expression) {
          resolvedExpr = derivedForField.expression;
          if (!func || func === "SUM") func = (derivedForField.defaultAggregation || "SUM").toUpperCase();
          const unwrapped = unwrapAggExpression(resolvedExpr);
          isCompoundAggregate = !unwrapped && /\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/i.test(resolvedExpr);
          if (unwrapped) {
            resolvedExpr = unwrapped.inner;
            func = unwrapped.func;
          }
        }
        (m as any)._compoundAggregate = isCompoundAggregate;

        const fieldExpr = (() => {
          if (resolvedExpr) {
            const countIfSumIfAgg = buildCountIfSumIfAggregate(resolvedExpr, derivedByName);
            if (countIfSumIfAgg) {
              (m as any)._forceAggregate = countIfSumIfAgg;
              return "1";
            }
            // Ratio: num/den -> agregar como SUM(num)/NULLIF(SUM(den),0) para que al cambiar dimensión sea correcto
            const ratioParsed = parseRatioExpression(resolvedExpr);
            if (ratioParsed) {
              const numHasAgg = /\b(SUM|AVG|COUNT|MIN|MAX|COUNTA)\s*\(/i.test(ratioParsed.numerator);
              const denHasAgg = /\b(SUM|AVG|COUNT|MIN|MAX|COUNTA)\s*\(/i.test(ratioParsed.denominator);
              if (numHasAgg || denHasAgg) {
                (m as any)._ratioAggregateError = true;
                return "1";
              }
              const numSql = expressionToSql(ratioParsed.numerator, derivedByName);
              const denSql = expressionToSql(ratioParsed.denominator, derivedByName);
              if (numSql && denSql) {
                (m as any)._ratioAggregate = {
                  numSql: safeNumericCast(`(${numSql})`),
                  denSql: safeNumericCast(`(${denSql})`),
                };
                return "1";
              }
            }
            // UNIQUE(expr) como expresión completa -> COUNT(DISTINCT expr); se maneja en aggExpr más abajo
            const uniqueMatch = resolvedExpr.trim().match(/^\s*UNIQUE\s*\(([\s\S]+)\)\s*$/i);
            if (uniqueMatch) {
              const inner = uniqueMatch[1]!.trim();
              const innerSql = expressionToSql(inner, derivedByName);
              if (innerSql) {
                const countDistinctExpr = `COUNT(DISTINCT (${innerSql}))`;
                (m as any)._forceCountDistinct = countDistinctExpr;
                return innerSql;
              }
            }
            const sqlExpr = expressionToSql(resolvedExpr, derivedByName);
            if (sqlExpr) return safeNumericCast(`(${sqlExpr})`);
            console.warn("[aggregate-data] expressionToSql returned null for:", resolvedExpr);
          }
          if (derived) {
            console.warn("[aggregate-data] FALLTHROUGH: derived col", m.field, "expr:", derived.expression, "resolvedExpr:", resolvedExpr);
          }
          // Si la métrica guardada no pudo resolverse a un campo real (field === nombre), evitar columna inexistente
          const isSavedNameAsColumn = savedMetric && String(effectiveField || "").trim().toLowerCase() === String(m.field || "").trim().toLowerCase();
          if (isSavedNameAsColumn && (func === "COUNT" || func.startsWith("COUNT(DISTINCT"))) {
            return "1";
          }
          if (isSavedNameAsColumn) {
            return "0";
          }
          const col = quotedColumn(effectiveField!);
          if (m.cast === "sanitize")
            return safeNumericCast(`regexp_replace(${col}::text, '[^0-9\\.-]', '', 'g')`);
          if (m.cast === "numeric") return safeNumericCast(col);
          return col;
        })();

        const internalAlias = `metric_${i}`;
        (m as any).internalAlias = internalAlias;

        let aggExpr: string;
        const forceAggregate = (m as any)._forceAggregate as string | undefined;
        const forceCountDistinct = (m as any)._forceCountDistinct as string | undefined;
        const compoundAggregate = (m as any)._compoundAggregate as boolean | undefined;
        const ratioAggregate = (m as any)._ratioAggregate as { numSql: string; denSql: string } | undefined;
        if (ratioAggregate) {
          aggExpr = `SUM(${ratioAggregate.numSql}) / NULLIF(SUM(${ratioAggregate.denSql}), 0)`;
        } else if (forceAggregate) {
          aggExpr = forceAggregate;
        } else if (forceCountDistinct) {
          aggExpr = forceCountDistinct;
        } else if (compoundAggregate) {
          aggExpr = fieldExpr;
        } else if (m.condition) {
          const whenClause = buildWhenClause(m.condition);
          if (func === "COUNT" || func.startsWith("COUNT(DISTINCT"))
            aggExpr = `COUNT(CASE WHEN ${whenClause} THEN 1 END)`;
          else
            aggExpr = `${func}(${buildConditionExpr(m.condition, fieldExpr)})`;
        } else {
          if (func === "COUNTA") {
            aggExpr = `COUNT(${fieldExpr})`;
          } else if (func.startsWith("COUNT(DISTINCT"))
            aggExpr = `COUNT(DISTINCT ${fieldExpr})`;
          else
            aggExpr = `${func}(${fieldExpr})`;
        }
        return `${aggExpr} AS "${internalAlias}"`;
      })
      .join(", ");

    if (metricsBase.some((m) => (m as any)._ratioAggregateError)) {
      return NextResponse.json(
        { error: "No se puede usar una expresión que sea «agregado / agregado» (ej. sum(...)/count(...)) como una sola métrica. Creá dos métricas (numerador y denominador), guardalas, y luego en Cálculo usá «Reutilizar métricas existentes» con fórmula metric_0 / NULLIF(metric_1, 0)." },
        { status: 400 }
      );
    }

    // 2. Dimensiones (una o varias) + dateGroupBy (DATE_TRUNC)
    const dimList = (body.dimensions && body.dimensions.length > 0)
      ? body.dimensions.filter((d) => !isInvalidIdentifier(d))
      : body.dimension && !isInvalidIdentifier(body.dimension)
        ? [body.dimension]
        : [];
    let dimensionSelectClause = "";
    let dimensionGroupByClause = "";
    let dateGroupByExpr = "";
    let dateGroupByDisplayExpr = "";

    if (body.dateGroupBy?.field && body.dateGroupBy?.granularity) {
      const dgCol = quotedColumn(body.dateGroupBy.field);
      const dgDateExpr = safeDateCast(dgCol);
      const gran = body.dateGroupBy.granularity.toLowerCase().replace(/[^a-z]/g, "");
      const validGranList = ["day", "week", "month", "quarter", "semester", "year"];
      const validGran = validGranList.includes(gran) ? gran : "month";
      if (validGran === "semester") {
        dateGroupByExpr = `(EXTRACT(YEAR FROM ${dgDateExpr}::timestamp)::text || '-S' || CASE WHEN EXTRACT(MONTH FROM ${dgDateExpr}::timestamp) <= 6 THEN '1' ELSE '2' END)`;
        dateGroupByDisplayExpr = `(CASE WHEN EXTRACT(MONTH FROM ${dgDateExpr}::timestamp) <= 6 THEN 'S1/' ELSE 'S2/' END || EXTRACT(YEAR FROM ${dgDateExpr}::timestamp)::text)`;
      } else {
        dateGroupByExpr = `DATE_TRUNC('${validGran}', ${dgDateExpr}::timestamp)`;
        if (validGran === "year") {
          dateGroupByDisplayExpr = `TO_CHAR(${dateGroupByExpr}, 'YYYY')`;
        } else if (validGran === "month") {
          dateGroupByDisplayExpr = `TO_CHAR(${dateGroupByExpr}, 'YYYY-MM')`;
        } else if (validGran === "quarter") {
          dateGroupByDisplayExpr = `('T' || EXTRACT(QUARTER FROM ${dateGroupByExpr})::text || '/' || EXTRACT(YEAR FROM ${dateGroupByExpr})::text)`;
        } else {
          // day/week: mostrar fecha de inicio del bucket
          dateGroupByDisplayExpr = `TO_CHAR(${dateGroupByExpr}, 'DD/MM/YYYY')`;
        }
      }
      // No agregar columna "periodo": la dimensión temporal usa el nombre del campo (ej. FECHA_COMPRA) con valores agrupados por granularidad.
      const timeField = (body.dateGroupBy.field || "").trim().replace(/"/g, '""');
      const dateParts =
        dimList.length > 0
          ? dimList.map((d) => {
              const alias = (d || "").trim().replace(/"/g, '""');
              if (alias === body.dateGroupBy!.field?.trim() || normalizeStr(alias) === normalizeStr(body.dateGroupBy!.field || "")) {
                return `${dateGroupByDisplayExpr} AS "${alias}"`;
              }
              const col = quotedColumn(d);
              return `COALESCE(${col}::text, 'Sin Categoría') AS "${alias}"`;
            })
          : [`${dateGroupByDisplayExpr} AS "${timeField}"`];
      dimensionSelectClause = dateParts.join(", ");
      const groupParts = [dateGroupByExpr];
      if (dimList.length > 0) {
        groupParts.push(
          ...dimList
            .filter((d) => (d || "").trim() !== (body.dateGroupBy!.field || "").trim() && normalizeStr((d || "").trim()) !== normalizeStr(body.dateGroupBy!.field || ""))
            .map((d) => `COALESCE(${quotedColumn(d)}::text, 'Sin Categoría')`)
        );
      }
      dimensionGroupByClause = groupParts.join(", ");
    } else if (dimList.length > 0) {
      const parts = dimList.map((d) => {
        const col = quotedColumn(d);
        const alias = (d || "").trim().replace(/"/g, '""');
        return `COALESCE(${col}::text, 'Sin Categoría') AS "${alias}"`;
      });
      dimensionSelectClause = parts.join(", ");
      dimensionGroupByClause = dimList
        .map((d) => `COALESCE(${quotedColumn(d)}::text, 'Sin Categoría')`)
        .join(", ");
    }

    const selectClause = [dimensionSelectClause, metricClauses]
      .filter(Boolean)
      .join(", ");
    if (!selectClause.trim()) {
      return NextResponse.json(
        { error: "La consulta debe incluir al menos una dimensión o una métrica base (no solo fórmulas)." },
        { status: 400 }
      );
    }
    let query = `SELECT ${selectClause} FROM "${schema}"."${table}"`;

    // 3. Filtros (dateRangeFilter primero, luego los del usuario)
    let whereClausesStr = "";
    const dateRangeClause = (() => {
      const dr = body.dateRangeFilter;
      if (!dr?.field) return "";
      const drCol = quotedColumn(dr.field);
      const drDateExpr = safeDateCast(drCol);
      if (dr.from != null && dr.to != null) {
        const from = String(dr.from).trim().replace(/'/g, "''");
        const to = String(dr.to).trim().replace(/'/g, "''");
        if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
          return `${drDateExpr} BETWEEN '${from}' AND '${to}'`;
        }
      }
      if (dr.last == null || Number(dr.last) <= 0) return "";
      const n = Math.max(1, Math.min(9999, Math.round(Number(dr.last))));
      const unit = dr.unit === "days" ? "days" : "months";
      const maxDateSubquery = `(SELECT MAX(${drDateExpr}) FROM "${schema}"."${table}")`;
      return `${drDateExpr} >= (${maxDateSubquery} - INTERVAL '${n} ${unit}')`;
    })();

    if (validFilters.length > 0) {
      const whereClauses = validFilters
        .map((f) => {
          const col = quotedColumn(f.field);
          const op = (f.operator || "=").toUpperCase().trim();

          const useDateExprForYearLike =
            (op === "=" && isYearLike(f.value)) ||
            (op === "IN" && Array.isArray(f.value) && f.value.length > 0 && isYearLike(f.value));
          let fieldExpression;
          if (
            op === "MONTH" ||
            op === "DAY" ||
            op === "YEAR" ||
            op === "QUARTER" ||
            op === "SEMESTER" ||
            op === "YEAR_MONTH" ||
            useDateExprForYearLike
          ) {
            fieldExpression = safeDateCast(col);
          } else {
            fieldExpression =
              f.cast === "numeric"
                ? safeNumericCast(col)
                : col;
          }

          if (op === "MONTH") {
            return buildMonthFilterSqlClause(fieldExpression, f.value);
          }
          if (op === "YEAR") {
            if (Array.isArray(f.value)) {
              const list = f.value
                .map((v) => Number(v))
                .filter((n) => !isNaN(n))
                .join(", ");
              return `EXTRACT(YEAR FROM ${fieldExpression}) IN (${list})`;
            }
            return `EXTRACT(YEAR FROM ${fieldExpression}) = ${Number(f.value)}`;
          }
          if (op === "DAY") {
            const dayStr = String(f.value || "").trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) return "TRUE";
            return `${fieldExpression} = DATE '${dayStr}'`;
          }
          if (op === "QUARTER") {
            if (Array.isArray(f.value)) {
              const list = f.value
                .map((v) => Number(v))
                .filter((n) => !isNaN(n) && n >= 1 && n <= 4)
                .join(", ");
              if (!list) return "TRUE";
              return `EXTRACT(QUARTER FROM ${fieldExpression}) IN (${list})`;
            }
            const q = Number(f.value);
            if (isNaN(q) || q < 1 || q > 4) return "TRUE";
            return `EXTRACT(QUARTER FROM ${fieldExpression}) = ${q}`;
          }
          if (op === "SEMESTER") {
            const semExpr = `(CASE WHEN EXTRACT(MONTH FROM ${fieldExpression}) <= 6 THEN 1 ELSE 2 END)`;
            if (Array.isArray(f.value)) {
              const list = f.value
                .map((v) => Number(v))
                .filter((n) => !isNaN(n) && (n === 1 || n === 2))
                .join(", ");
              if (!list) return "TRUE";
              return `${semExpr} IN (${list})`;
            }
            const s = Number(f.value);
            if (isNaN(s) || (s !== 1 && s !== 2)) return "TRUE";
            return `${semExpr} = ${s}`;
          }
          if (op === "YEAR_MONTH") {
            return buildMonthFilterSqlClause(fieldExpression, f.value);
          }
          if (op === "=" && isYearLike(f.value)) {
            return `EXTRACT(YEAR FROM ${fieldExpression}) = ${Number(f.value)}`;
          }
          if (op === "IN" && Array.isArray(f.value) && f.value.length > 0 && isYearLike(f.value)) {
            const yearList = f.value
              .map((v) => Number(v))
              .filter((n) => !isNaN(n) && n >= 1900 && n <= 2100)
              .join(", ");
            if (yearList) return `EXTRACT(YEAR FROM ${fieldExpression}) IN (${yearList})`;
          }
          if (op === "IN") {
            const list = (Array.isArray(f.value) ? f.value : [])
              .map((x) => toSqlLiteral(x))
              .join(", ");
            return `${fieldExpression} IN (${list})`;
          }
          if (op === "BETWEEN") {
            let from: any, to: any;
            if (Array.isArray(f.value)) [from, to] = f.value;
            else if (f.value && typeof f.value === "object") {
              from = (f.value as any).from;
              to = (f.value as any).to;
            }
            return `${fieldExpression} BETWEEN ${toSqlLiteral(
              from
            )} AND ${toSqlLiteral(to)}`;
          }
          if ((op === "IS" || op === "IS NOT") && f.value === null)
            return `${col} ${op} NULL`;

          if (op === "EXACT") return `${fieldExpression} = ${toSqlLiteral(f.value)}`;
          if (op === "CONTAINS") return `${fieldExpression}::text ILIKE '%' || ${toSqlLiteral(String(f.value ?? ""))} || '%'`;
          if (op === "STARTS_WITH") return `${fieldExpression}::text ILIKE ${toSqlLiteral(String(f.value ?? ""))} || '%'`;
          if (op === "ENDS_WITH") return `${fieldExpression}::text ILIKE '%' || ${toSqlLiteral(String(f.value ?? ""))}`;

          return `${fieldExpression} ${op} ${toSqlLiteral(f.value)}`;
        })
        .join(" AND ");
      whereClausesStr = whereClauses || "";
    }
    const allWhere = [dateRangeClause, whereClausesStr].filter(Boolean).join(" AND ");
    if (allWhere) query += ` WHERE ${allWhere}`;

    // 4. Group By
    if (dimensionGroupByClause) {
      query += ` GROUP BY ${dimensionGroupByClause}`;
    }

    // 5. Order By (dimensión o métrica por alias interno; dateGroupBy ordena por periodo ASC por defecto)
    if (body.orderBy?.field) {
      const dir = (body.orderBy.direction || "DESC").toString().toUpperCase();
      const safeDir = dir === "ASC" ? "ASC" : "DESC";
      let orderByField = `"${body.orderBy.field.replace(/"/g, '""')}"`;
      const requestedSortNormalized = normalizeStr(body.orderBy.field);
      const dateFieldNormalized = normalizeStr(body.dateGroupBy?.field || "");
      const temporalSortRequested =
        !!dateGroupByExpr &&
        !!dateFieldNormalized &&
        (
          requestedSortNormalized === dateFieldNormalized ||
          requestedSortNormalized.includes(dateFieldNormalized) ||
          dateFieldNormalized.includes(requestedSortNormalized)
        );
      if (temporalSortRequested) {
        // Evita ordenar por alias display (p. ej. YYYY-MM) y fuerza orden cronológico real.
        orderByField = dateGroupByExpr;
      }
      const dimMatch = dimList.find((d) => normalizeStr(d) === requestedSortNormalized);
      if (!temporalSortRequested && dimMatch) {
        orderByField = `"${dimMatch.replace(/"/g, '""')}"`;
      } else if (!temporalSortRequested) {
        const metricIdxMatch = /^metric_(\d+)$/i.exec(String(body.orderBy.field || "").trim());
        let orderByInternal: string | undefined;
        if (metricIdxMatch) {
          const idx = parseInt(metricIdxMatch[1]!, 10);
          if (Number.isFinite(idx) && idx >= 0 && idx < body.metrics.length) {
            const ia = (body.metrics[idx] as { internalAlias?: string }).internalAlias;
            if (typeof ia === "string" && ia.trim() !== "") orderByInternal = ia;
          }
        }
        if (orderByInternal) {
          orderByField = `"${orderByInternal.replace(/"/g, '""')}"`;
        } else {
          const matchedMetric = body.metrics.find((m) => {
            const sig = `${m.func}(${m.field})`;
            return (
              requestedSortNormalized === normalizeStr(m.alias || "") ||
              requestedSortNormalized === normalizeStr(sig)
            );
          });
          if (matchedMetric)
            orderByField = `"${(matchedMetric as any).internalAlias}"`;
        }
      }
      query += ` ORDER BY ${orderByField} ${safeDir}`;
    } else if (dateGroupByExpr) {
      query += ` ORDER BY ${dateGroupByExpr} ASC`;
    }

    const SAFETY_MAX_ROWS = 500_000;
    if (body.unlimited === true) {
      query += ` LIMIT ${SAFETY_MAX_ROWS}`;
    } else if (body.limit != null && body.limit > 0) {
      const lim = Math.max(1, Math.min(SAFETY_MAX_ROWS, parseInt(String(body.limit), 10) || 5000));
      query += ` LIMIT ${lim}`;
    }

    // 5b. Fórmulas derivadas: subquery y columnas calculadas (permite metric_N y alias de otras métricas; solo caracteres seguros)
    const aliasToMetricRef: { alias: string; ref: string }[] = body.metrics
      .map((m, idx) => ({ alias: (m.alias || "").trim(), ref: `metric_${idx}` }))
      .filter((x) => x.alias.length > 0)
      .sort((a, b) => b.alias.length - a.alias.length);
    const resolveAliasesInFormula = (formula: string): string => {
      let s = formula.replace(/\s+/g, " ").trim();
      for (const { alias, ref } of aliasToMetricRef) {
        if (alias && s.includes(alias)) s = s.split(alias).join(ref);
      }
      return s;
    };
    const safeFormula = (expr: string) => {
      if (!expr || typeof expr !== "string") return null;
      const withAliases = resolveAliasesInFormula(expr);
      const s = withAliases.replace(/\s+/g, " ").trim();
      if (!/^[metric_0-9\s\-+*/().,NULLIFROUNDCOALESCE]+$/i.test(s)) return null;
      return s;
    };
    const findMetricRefsInFormula = (expr: string): number[] => {
      const refs: number[] = [];
      const re = /metric_(\d+)\b/gi;
      let match: RegExpExecArray | null;
      while ((match = re.exec(expr)) != null) {
        const idx = Number.parseInt(match[1] ?? "", 10);
        if (Number.isFinite(idx)) refs.push(idx);
      }
      return refs;
    };
    if (metricsFormula.length > 0) {
      const maxMetricIndex = body.metrics.length - 1;
      for (const m of metricsFormula) {
        const expr = safeFormula(m.formula!);
        if (!expr) {
          return NextResponse.json(
            { error: `Fórmula inválida en la métrica «${m.alias || "sin nombre"}». Revisá la sintaxis.` },
            { status: 400 }
          );
        }
        const outOfRangeRef = findMetricRefsInFormula(expr).find((idx) => idx < 0 || idx > maxMetricIndex);
        if (outOfRangeRef != null) {
          return NextResponse.json(
            { error: `La fórmula de «${m.alias || "sin nombre"}» referencia metric_${outOfRangeRef}, pero solo existen métricas hasta metric_${maxMetricIndex}.` },
            { status: 400 }
          );
        }
      }
      const formulaSelects = metricsFormula
        .map((m) => {
          const i = body.metrics.indexOf(m);
          const expr = safeFormula(m.formula!);
          if (!expr) return null;
          return `(${expr}) AS "metric_${i}"`;
        })
        .filter(Boolean);
      if (formulaSelects.length > 0)
        query = `SELECT _sub.*, ${formulaSelects.join(", ")} FROM (${query}) AS _sub`;
    }

    // 5c. Acumulados: ventana SUM() OVER (ORDER BY primera dimensión)
    const cumulative = body.cumulative && body.cumulative !== "none" && dimList.length > 0;
    if (cumulative) {
      const orderDim = dimList[0].replace(/"/g, '""');
      const partition =
        body.cumulative === "ytd" && body.dateDimension
          ? `PARTITION BY EXTRACT(YEAR FROM "${body.dateDimension.replace(/"/g, '""')}"::date)`
          : "";
      const windowExpr = body.metrics
        .map((m, i) => {
          const alias = `metric_${i}`;
          return `SUM("${alias}") OVER (${partition} ORDER BY "${orderDim}" ROWS UNBOUNDED PRECEDING) AS "${alias}_cumulative"`;
        })
        .join(", ");
      query = `SELECT *, ${windowExpr} FROM (${query}) AS _cum`;
    }

    // 6. Ejecución
    console.log("[aggregate-data] query:", query.slice(0, 300), "| derivedKeys:", Object.keys(derivedByName));
    const { data, error } = await (supabase as any).rpc("execute_sql", {
      sql_query: query,
    });

    if (error) {
      const msg = error.message || String(error);
      console.error("[aggregate-data] execute_sql error:", msg, "Query:", query.slice(0, 500), "derivedByName:", JSON.stringify(derivedByName));
      let userMsg = "Error al ejecutar la agregación: " + msg;
      if (/column\s+["']?(\w+)["']?\s+does not exist/i.test(msg)) {
        const colMatch = msg.match(/column\s+["']?(\w+)["']?\s+does not exist/i);
        const colName = colMatch ? colMatch[1] : "";
        const isDerived = derivedByName[colName.toLowerCase()];
        if (isDerived) {
          userMsg = `Error interno: la columna «${colName}» fue encontrada como derivada (expr: ${isDerived.expression}) pero el SQL generado no la expandió. Contactá soporte.`;
        } else {
          const availableDerived = Object.keys(derivedByName).join(", ") || "(ninguna)";
          const savedNames = Object.keys(savedMetricByName).length ? ` Métricas guardadas del ETL: ${Object.keys(savedMetricByName).join(", ")}.` : "";
          userMsg = `La columna «${colName}» no existe en la tabla ni como columna calculada. Columnas calculadas disponibles: ${availableDerived}. Creala en Métricas → Fórmula → Crear columna. Si «${colName}» es una métrica guardada, asegurate de que el widget use la fuente de datos del ETL donde está definida (mismo ETL) o enviá en el body del request el array «savedMetrics» con la definición de esa métrica (name, field, expression, etc.).${savedNames}`;
        }
      }
      return NextResponse.json(
        { error: userMsg },
        { status: 500 }
      );
    }

    let results = data || [];

    // 6b. Comparación temporal: segundo query período anterior y merge
    if (body.comparePeriod && dimList.length > 0 && body.dateDimension) {
      const dateColExpr = safeDateCast(quotedColumn(body.dateDimension));
      const now = new Date();
      let prevStart: string;
      let prevEnd: string;
      if (body.comparePeriod === "previous_year") {
        const y = now.getFullYear() - 1;
        prevStart = `${y}-01-01`;
        prevEnd = `${y}-12-31`;
      } else {
        const m = now.getMonth();
        const y = m === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const pm = m === 0 ? 12 : m;
        prevStart = `${y}-${String(pm).padStart(2, "0")}-01`;
        const lastDay = new Date(y, pm, 0).getDate();
        prevEnd = `${y}-${String(pm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      }
      const dateFilter = `${dateColExpr} BETWEEN '${prevStart}' AND '${prevEnd}'`;
      const prevWhere = whereClausesStr ? `${dateFilter} AND (${whereClausesStr})` : dateFilter;
      const simplePrevQuery = `SELECT ${dimensionSelectClause}, ${metricClauses} FROM "${schema}"."${table}" WHERE ${prevWhere} GROUP BY ${dimensionGroupByClause}`;
      try {
        const { data: prevData } = await (supabase as any).rpc("execute_sql", {
          sql_query: simplePrevQuery,
        });
        const prevRows = (prevData || []) as Record<string, any>[];
        const prevByDim = new Map<string, Record<string, any>>();
        const dimKey = (r: any) => dimList.map((d) => String(r[d] ?? "")).join("\t");
        prevRows.forEach((r) => prevByDim.set(dimKey(r), r));
        results = results.map((row: any) => {
          const key = dimKey(row);
          const prev = prevByDim.get(key);
          const out = { ...row };
          metricsBase.forEach((m) => {
            const alias = (m as any).internalAlias;
            const v = row[alias] != null ? Number(row[alias]) : null;
            const vPrev = prev?.[alias] != null ? Number(prev[alias]) : null;
            out[`${alias}_prev`] = vPrev;
            out[`${alias}_delta`] = (v != null && vPrev != null) ? v - vPrev : null;
            if (v != null && vPrev != null && vPrev !== 0)
              out[`${alias}_delta_pct`] = ((v - vPrev) / vPrev) * 100;
            else if (v != null && vPrev != null)
              out[`${alias}_delta_pct`] = vPrev === 0 ? (v === 0 ? 0 : 100) : null;
            else
              out[`${alias}_delta_pct`] = null;
          });
          return out;
        });
        const accumulator: Record<string, number> = {};
        results.forEach((row: any) => {
          metricsBase.forEach((m) => {
            const alias = (m as any).internalAlias;
            const v = row[alias] != null ? Number(row[alias]) : 0;
            accumulator[alias] = (accumulator[alias] || 0) + v;
            row[`${alias}_acumulado`] = accumulator[alias];
          });
        });
      } catch (_) {
        // si falla comparación, devolver solo resultados actuales
      }
    }

    // 6c. Comparación contra valor fijo: agrega columnas _vs_fijo y _var_pct_fijo
    const fixedVal = body.compareFixedValue != null && typeof body.compareFixedValue === "number" && Number.isFinite(body.compareFixedValue) ? body.compareFixedValue : null;
    if (fixedVal !== null) {
      results = results.map((row: any) => {
        const out = { ...row };
        body.metrics.forEach((m, i) => {
          const alias = (m as any).internalAlias;
          const v = row[alias] != null ? Number(row[alias]) : null;
          if (v != null && Number.isFinite(v)) {
            out[`${alias}_vs_fijo`] = v - fixedVal;
            out[`${alias}_var_pct_fijo`] = fixedVal !== 0 ? ((v - fixedVal) / fixedVal) * 100 : (v === 0 ? 0 : null);
          }
        });
        return out;
      });
    }

    // 7. Mapeo final: metric_X -> alias del usuario
    const mappedResults = results.map((row: any) => {
      const newRow = { ...row };

      body.metrics.forEach((m, i) => {
        const internalKey = `metric_${i}`;
        const externalKey = m.alias || `${m.func}(${m.field})`;
        if (Object.prototype.hasOwnProperty.call(newRow, internalKey)) {
          newRow[externalKey] = newRow[internalKey];
          delete newRow[internalKey];
        }
        if (cumulative && Object.prototype.hasOwnProperty.call(newRow, `${internalKey}_cumulative`)) {
          newRow[`${externalKey}_acumulado`] = newRow[`${internalKey}_cumulative`];
          delete newRow[`${internalKey}_cumulative`];
        }
        if (body.comparePeriod) {
          for (const suffix of ["_prev", "_delta", "_delta_pct", "_acumulado"]) {
            if (Object.prototype.hasOwnProperty.call(newRow, `${internalKey}${suffix}`)) {
              newRow[`${externalKey}${suffix}`] = newRow[`${internalKey}${suffix}`];
              delete newRow[`${internalKey}${suffix}`];
            }
          }
        }
        if (fixedVal !== null) {
          if (Object.prototype.hasOwnProperty.call(newRow, `${internalKey}_vs_fijo`)) {
            newRow[`${externalKey}_vs_fijo`] = newRow[`${internalKey}_vs_fijo`];
            delete newRow[`${internalKey}_vs_fijo`];
          }
          if (Object.prototype.hasOwnProperty.call(newRow, `${internalKey}_var_pct_fijo`)) {
            newRow[`${externalKey}_var_pct_fijo`] = newRow[`${internalKey}_var_pct_fijo`];
            delete newRow[`${internalKey}_var_pct_fijo`];
          }
        }
      });

      // Compatibilidad defensiva: normalizar formato temporal legacy en memoria.
      if (body.dateGroupBy?.field && body.dateGroupBy?.granularity) {
        const key =
          Object.keys(newRow).find((k) => normalizeStr(k) === normalizeStr(body.dateGroupBy?.field ?? "")) ??
          body.dateGroupBy.field;
        const current = newRow[key];
        if (typeof current === "string" && current.trim() !== "") {
          const normalized = formatDateByGranularity(
            current,
            body.dateGroupBy.granularity as DateGranularity,
            current
          );
          if (normalized != null) newRow[key] = normalized;
        }
      }

      return newRow;
    });

    const requestedSortNormalized = normalizeStr(body.orderBy?.field || "");
    const dateFieldNormalized = normalizeStr(body.dateGroupBy?.field || "");
    const temporalKey =
      body.dateGroupBy?.field
        ? (mappedResults[0]
            ? Object.keys(mappedResults[0]).find((k) => normalizeStr(k) === normalizeStr(body.dateGroupBy?.field || ""))
            : undefined) ?? body.dateGroupBy.field
        : undefined;
    const requestedTemporalSort =
      !!body.dateGroupBy?.field &&
      (
        requestedSortNormalized === "" ||
        requestedSortNormalized === dateFieldNormalized ||
        requestedSortNormalized === normalizeStr(temporalKey || "") ||
        requestedSortNormalized.includes(dateFieldNormalized) ||
        requestedSortNormalized.includes(normalizeStr(temporalKey || "")) ||
        dateFieldNormalized.includes(requestedSortNormalized)
      );
    const directionMultiplier =
      (body.orderBy?.direction || "ASC").toString().toUpperCase() === "DESC" ? -1 : 1;

    // Defensa final: evita orden lexicográfico incorrecto en etiquetas de periodo por configuraciones heredadas.
    const sortedResults =
      body.dateGroupBy?.field && requestedTemporalSort && temporalKey
        ? [...mappedResults].sort((a, b) => {
            const va = (a as Record<string, unknown>)[temporalKey];
            const vb = (b as Record<string, unknown>)[temporalKey];
            const ta = parseDateLike(va)?.getTime() ?? NaN;
            const tb = parseDateLike(vb)?.getTime() ?? NaN;
            if (!Number.isNaN(ta) && !Number.isNaN(tb)) return (ta - tb) * directionMultiplier;
            return String(va ?? "").localeCompare(String(vb ?? ""), undefined, { numeric: true }) * directionMultiplier;
          })
        : mappedResults;

    const shouldEnrichGeo =
      requestedChartType === "map" ||
      /\b(lat|lon|lng|geo|country|pais|ciudad|city|localidad|provincia|estado)\b/i.test(dimList.join(" "));
    const cacheClient = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? (createServiceRoleClient() as unknown as GeoCacheClient)
      : null;
    const geoReadyRows = shouldEnrichGeo
      ? await enrichRowsWithGeo({
          rows: sortedResults as Record<string, unknown>[],
          dimList,
          chartXAxis: body.chartXAxis ?? body.dimension ?? body.dimensions?.[0],
          geoHints: body.geoHints,
          mapDefaultCountry: typeof body.mapDefaultCountry === "string" ? body.mapDefaultCountry : undefined,
          geoComponentOverrides: coerceGeoComponentOverrides(body.geoComponentOverrides),
          geoOverridesByXLabel: coerceGeoOverridesByXLabel(body.geoOverridesByXLabel),
          cacheClient,
        })
      : sortedResults;

    if (filterWarnings.length > 0) {
      return NextResponse.json({ rows: geoReadyRows, filterWarnings });
    }
    return NextResponse.json(geoReadyRows);
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error("[aggregate-data] Error:", message, err);
    return NextResponse.json(
      { error: "Error en agregación: " + message },
      { status: 500 }
    );
  }
}
