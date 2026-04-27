import { buildCountIfSumIfAggregate } from "./aggregates";
import { FormulaCycleError } from "./errors";
import {
  expandAndOr,
  expandIfError,
  expandIfNa,
  expandIfsToCaseWhen,
  expandIfToCaseWhen,
  expandSwitch,
  expandXor,
} from "./expand";
import {
  extractParenContent,
  findMatchingCloseParen,
  findTopLevelAmpersand,
  findTopLevelDivision,
  quotedColumn,
  splitArgs,
} from "./helpers";
import { AGGREGATE_FUNCTION_NAMES, SQL_KNOWN_FUNCTIONS } from "./tokens";
import type { DerivedColumnRef, ExpansionContext, SqlDialect } from "./types";

export { FormulaCycleError } from "./errors";
export {
  checkBalancedParens,
  displayColumnToPhysical,
  extractParenContent,
  findMatchingCloseParen,
  findTopLevelAmpersand,
  findTopLevelDivision,
  quotedColumn,
  quoteSimpleIdent,
  splitArgs,
  toSqlLiteral,
} from "./helpers";
export { SQL_KNOWN_FUNCTIONS, AGGREGATE_FUNCTION_NAMES, KNOWN_FORMULA_IDENTIFIERS } from "./tokens";
export type { DerivedColumnRef, ExpansionContext, SqlDialect } from "./types";
export { buildCountIfSumIfAggregate } from "./aggregates";

export function createExpansionContext(dialect: SqlDialect = "postgres"): ExpansionContext {
  return { visitedDerived: new Set<string>(), dialect };
}

/** True si la expresión usa funciones de agregación (SUM, COUNTIF, MEDIAN, etc.). */
export function expressionHasAggregation(expr: string): boolean {
  const t = (expr || "").trim();
  return Array.from(AGGREGATE_FUNCTION_NAMES).some((fn) => new RegExp(`\\b${fn}\\s*\\(`, "i").test(t));
}

/** Si la expresión es un ratio (num/den a nivel top), devuelve { numerator, denominator }. */
export function parseRatioExpression(expr: string): { numerator: string; denominator: string } | null {
  const s = expr.replace(/\s+/g, " ").trim();
  const idx = findTopLevelDivision(s);
  if (idx <= 0 || idx >= s.length - 1) return null;
  const numerator = s.slice(0, idx).trim();
  const denominator = s.slice(idx + 1).trim();
  if (!numerator || !denominator) return null;
  return { numerator, denominator };
}

/** Si la expresión es exactamente una llamada de agregación, devuelve { func, inner }. */
export function unwrapAggExpression(expr: string): { func: string; inner: string } | null {
  const s = expr.trim();
  const headMatch = s.match(
    /^(SUM|AVG|AVERAGE|COUNT|COUNTA|MIN|MAX|MEDIAN|MODE|STDEV|STDEVP|VAR|VARP|STDDEV_SAMP|STDDEV_POP|VAR_SAMP|VAR_POP)\s*\(/i
  );
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
  if (func === "STDEV") func = "STDDEV_SAMP";
  if (func === "STDEVP") func = "STDDEV_POP";
  if (func === "VAR") func = "VAR_SAMP";
  if (func === "VARP") func = "VAR_POP";
  return { func, inner };
}

function expandAmpersandJoin(s: string, dialect: SqlDialect): string {
  const i = findTopLevelAmpersand(s);
  if (i === -1) return s;
  const left = s.slice(0, i).trim();
  const right = s.slice(i + 1).trim();
  if (dialect === "mysql") {
    return `CONCAT(COALESCE((${expandAmpersandJoin(left, dialect)}), ''), COALESCE((${expandAmpersandJoin(right, dialect)}), ''))`;
  }
  return `(COALESCE((${expandAmpersandJoin(left, dialect)})::text, '') || COALESCE((${expandAmpersandJoin(right, dialect)})::text, ''))`;
}

function expandUnaryFunc(
  s: string,
  name: string,
  wrap: (innerSql: string, dialect: SqlDialect) => string,
  dialect: SqlDialect,
  innerToSql: (inner: string) => string | null
): string {
  const re = new RegExp(`\\b${name}\\s*\\(`, "i");
  let out = s;
  for (;;) {
    const m = out.match(re);
    if (!m || m.index === undefined) break;
    const startParen = out.indexOf("(", m.index);
    const extracted = extractParenContent(out, startParen);
    if (!extracted) break;
    const innerSql = innerToSql(extracted.inner);
    if (!innerSql) break;
    const repl = wrap(innerSql, dialect);
    out = out.slice(0, m.index) + repl + out.slice(extracted.endIndex + 1);
  }
  return out;
}

function expandMedianMode(s: string, dialect: SqlDialect, innerToSql: (inner: string) => string | null): string {
  let out = s;
  const medRe = /\bMEDIAN\s*\(/i;
  for (;;) {
    const m = out.match(medRe);
    if (!m || m.index === undefined) break;
    const open = out.indexOf("(", m.index);
    const extracted = extractParenContent(out, open);
    if (!extracted) break;
    const innerSql = innerToSql(extracted.inner);
    if (!innerSql) break;
    const repl =
      dialect === "postgres"
        ? `(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (${innerSql})))`
        : `(${innerSql})`;
    out = out.slice(0, m.index) + repl + out.slice(extracted.endIndex + 1);
  }
  const modeRe = /\bMODE\s*\(/i;
  for (;;) {
    const m = out.match(modeRe);
    if (!m || m.index === undefined) break;
    const open = out.indexOf("(", m.index);
    const extracted = extractParenContent(out, open);
    if (!extracted) break;
    const innerSql = innerToSql(extracted.inner);
    if (!innerSql) break;
    const repl =
      dialect === "postgres"
        ? `(MODE() WITHIN GROUP (ORDER BY (${innerSql})))`
        : `(${innerSql})`;
    out = out.slice(0, m.index) + repl + out.slice(extracted.endIndex + 1);
  }
  return out;
}

function expandTextJoin(s: string, dialect: SqlDialect, innerToSql: (inner: string) => string | null): string {
  const tjRe = /\bTEXTJOIN\s*\(/i;
  let out = s;
  for (;;) {
    const m = out.match(tjRe);
    if (!m || m.index === undefined) break;
    const open = out.indexOf("(", m.index);
    const extracted = extractParenContent(out, open);
    if (!extracted) break;
    const args = splitArgs(extracted.inner);
    if (args.length < 3) break;
    const sepSql = innerToSql(args[0]!);
    const ignoreRaw = args[1]!.trim().toUpperCase();
    const ignore = ignoreRaw === "TRUE" || ignoreRaw === "1";
    const rest = args.slice(2).map((a) => innerToSql(a)).filter(Boolean) as string[];
    if (!sepSql || rest.length === 0) break;
    const parts = ignore
      ? rest.map((p) => `(NULLIF(trim((${p})::text), ''))`)
      : dialect === "postgres"
        ? rest.map((p) => `((${p})::text)`)
        : rest.map((p) => `(CAST((${p}) AS CHAR))`);
    const concatWs =
      dialect === "postgres"
        ? `CONCAT_WS((${sepSql})::text, ${parts.join(", ")})`
        : `CONCAT_WS((${sepSql}), ${parts.join(", ")})`;
    out = out.slice(0, m.index) + concatWs + out.slice(extracted.endIndex + 1);
  }
  return out;
}

function expandNaBare(s: string): string {
  return s.replace(/\bNA\s*\(\s*\)/gi, "NULL");
}

/**
 * Convierte expresión estilo Excel sobre columnas a SQL seguro (Postgres por defecto).
 * Lanza {@link FormulaCycleError} si hay referencia circular entre columnas derivadas.
 */
export function expressionToSql(
  expression: string,
  derivedLookup?: Record<string, DerivedColumnRef>,
  ctx?: ExpansionContext
): string | null {
  const context: ExpansionContext = ctx ?? createExpansionContext("postgres");

  const innerToSql = (inner: string) => expressionToSql(inner, derivedLookup, context);

  if (!expression || typeof expression !== "string") return null;
  let s = expression.replace(/\s+/g, " ").trim();
  if (!s) return null;
  s = s.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"').replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'");
  const allowed = /^[a-zA-Z0-9_*+\-/().,\s'"%;^=<>!&]+$/;
  if (!allowed.test(s)) return null;

  s = s.replace(/;/g, ",");

  const stringLiterals: string[] = [];
  s = s.replace(/'([^']*)'|"([^"]*)"/g, (_, single: string | undefined, double: string | undefined) => {
    const content = single !== undefined ? single : double!;
    const idx = stringLiterals.length;
    stringLiterals.push(content.replace(/'/g, "''"));
    return `__STR${idx}__`;
  });

  s = s.replace(/\bAVERAGE\s*\(/gi, "AVG(");
  s = s.replace(/\bLEN\s*\(/gi, "LENGTH(");
  s = s.replace(/\bMID\s*\(/gi, "SUBSTRING(");
  s = s.replace(/\bCONCATENATE\s*\(/gi, "CONCAT(");
  s = s.replace(/\bSTDEVP\s*\(/gi, "STDDEV_POP(");
  s = s.replace(/\bSTDEV\s*\(/gi, "STDDEV_SAMP(");
  s = s.replace(/\bVARP\s*\(/gi, "VAR_POP(");
  s = s.replace(/\bVAR\s*\(/gi, "VAR_SAMP(");

  s = expandNaBare(s);

  s = expandUnaryFunc(
    s,
    "ISBLANK",
    (inner, dialect) =>
      dialect === "postgres"
        ? `(((${inner})) IS NULL OR trim(((${inner}))::text) = '')`
        : `(((${inner})) IS NULL OR trim(COALESCE(CAST(((${inner})) AS CHAR), '')) = '')`,
    context.dialect,
    innerToSql
  );
  s = expandUnaryFunc(
    s,
    "ISNUMBER",
    (inner, dialect) =>
      dialect === "postgres"
        ? `(trim(((${inner}))::text) ~ '^[[:space:]]*[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?[[:space:]]*$')`
        : `(CAST(((${inner})) AS CHAR) REGEXP '^[[:space:]]*[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?[[:space:]]*$')`,
    context.dialect,
    innerToSql
  );
  s = expandUnaryFunc(
    s,
    "ISTEXT",
    (inner, dialect) =>
      dialect === "postgres"
        ? `(CASE WHEN (${inner}) IS NULL THEN FALSE ELSE NOT (trim(((${inner}))::text) ~ '^[[:space:]]*[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?[[:space:]]*$') END)`
        : `(CASE WHEN (${inner}) IS NULL THEN FALSE ELSE NOT (CAST(((${inner})) AS CHAR) REGEXP '^[[:space:]]*[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?[[:space:]]*$') END)`,
    context.dialect,
    innerToSql
  );
  s = expandUnaryFunc(
    s,
    "ISDATE",
    (inner, dialect) =>
      dialect === "postgres"
        ? `(((${inner}))::text ~ '^[[:space:]]*\\d{4}-\\d{2}-\\d{2}' OR (${inner})::text ~ '^[[:space:]]*\\d{1,2}/\\d{1,2}/\\d{4}')`
        : `(CAST(((${inner})) AS DATETIME) IS NOT NULL)`,
    context.dialect,
    innerToSql
  );
  s = expandUnaryFunc(s, "ISNA", (inner) => `((${inner}) IS NULL)`, context.dialect, innerToSql);
  s = expandUnaryFunc(s, "ISERROR", () => `FALSE`, context.dialect, innerToSql);

  s = expandTextJoin(s, context.dialect, innerToSql);

  const edateRe = /\bEDATE\s*\(/gi;
  for (;;) {
    const m = s.match(/\bEDATE\s*\(/i);
    if (!m || m.index === undefined) break;
    const open = s.indexOf("(", m.index);
    const extracted = extractParenContent(s, open);
    if (!extracted) break;
    const args = splitArgs(extracted.inner);
    if (args.length < 2) break;
    const dSql = innerToSql(args[0]!);
    const nSql = innerToSql(args[1]!);
    if (!dSql || !nSql) break;
    const repl =
      context.dialect === "postgres"
        ? `((${dSql})::date + ((${nSql})::text || ' months')::interval)::date`
        : `(DATE_ADD((${dSql}), INTERVAL (${nSql}) MONTH))`;
    s = s.slice(0, m.index!) + repl + s.slice(extracted.endIndex + 1);
  }

  s = expandUnaryFunc(
    s,
    "WEEKDAY",
    (inner, dialect) =>
      dialect === "postgres"
        ? `(((EXTRACT(DOW FROM ((${inner}))::timestamp)::int + 6) % 7 + 1))`
        : `(WEEKDAY((${inner})) + 1)`,
    context.dialect,
    innerToSql
  );
  s = expandUnaryFunc(
    s,
    "WEEKNUM",
    (inner, dialect) =>
      dialect === "postgres"
        ? `(EXTRACT(WEEK FROM ((${inner}))::timestamp))`
        : `(WEEK((${inner})))`,
    context.dialect,
    innerToSql
  );

  s = expandMedianMode(s, context.dialect, innerToSql);

  s = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*|\d+\.?\d*|__STR\d+__)\s+\^\s+([a-zA-Z_][a-zA-Z0-9_]*|\d+\.?\d*|__STR\d+__)\b/g, (_, a: string, b: string) => `POWER(${a},${b})`);

  while (findTopLevelAmpersand(s) !== -1) {
    s = expandAmpersandJoin(s, context.dialect);
  }

  while (/\bIFERROR\s*\(/i.test(s)) {
    const next = expandIfError(s);
    if (next === s) break;
    s = next;
  }
  while (/\bIFNA\s*\(/i.test(s)) {
    const next = expandIfNa(s);
    if (next === s) break;
    s = next;
  }
  while (/\bSWITCH\s*\(/i.test(s)) {
    const next = expandSwitch(s);
    if (next === s) break;
    s = next;
  }
  while (/\bXOR\s*\(/i.test(s)) {
    const next = expandXor(s);
    if (next === s) break;
    s = next;
  }

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
    const innerSql = expressionToSql(inner, derivedLookup, context);
    if (!innerSql) break;
    const repl = `COUNT(DISTINCT ${innerSql})`;
    s = s.slice(0, start) + repl + s.slice(countDistinctEnd + 1);
  }
  s = s.replace(/\bCOUNTA\s*\(/gi, "COUNT(");

  const out = s.replace(/\b(primary\.[a-zA-Z_][a-zA-Z0-9_]*|join_\d+\.[a-zA-Z_][a-zA-Z0-9_]*|[a-zA-Z_][a-zA-Z0-9_]*)\b/g, (id: string) => {
    if (/^__STR\d+__$/.test(id)) return id;
    if (/^\d+\.?\d*$/.test(id)) return id;
    if (SQL_KNOWN_FUNCTIONS.has(id.toUpperCase())) return id.toUpperCase();
    if (derivedLookup && !/\./.test(id)) {
      const key = id.toLowerCase();
      const ref = derivedLookup[key];
      if (ref?.expression) {
        if (context.visitedDerived.has(key)) {
          throw new FormulaCycleError(key);
        }
        context.visitedDerived.add(key);
        try {
          const inner = expressionToSql(ref.expression, derivedLookup, context);
          if (inner) return `(${inner})`;
        } finally {
          context.visitedDerived.delete(key);
        }
      }
    }
    return quotedColumn(id);
  });

  const withStrings = out.replace(/__STR(\d+)__/g, (_, i: string) => {
    const content = stringLiterals[Number(i)] ?? "";
    return `'${content}'`;
  });

  return withStrings || null;
}

/** Variante para validación en UI: no lanza por ciclo, devuelve null. */
export function tryExpressionToSql(
  expression: string,
  derivedLookup?: Record<string, DerivedColumnRef>,
  dialect: SqlDialect = "postgres"
): string | null {
  try {
    return expressionToSql(expression, derivedLookup, createExpansionContext(dialect));
  } catch (e) {
    if (e instanceof FormulaCycleError) return null;
    throw e;
  }
}
