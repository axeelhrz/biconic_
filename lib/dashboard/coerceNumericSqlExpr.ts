import {
  findElseBranchClosingEnd,
  findThenBranchBoundary,
  matchSqlKeywordAt,
  skipWsSql,
} from "@/lib/dashboard/caseSqlBranchScan";

/** Cast a numérico que devuelve NULL si el valor no es un número válido (evita "invalid input syntax for type numeric"). */
export function safeNumericCast(expr: string): string {
  const e = expr.trim();
  const pattern = "'^[[:space:]]*[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?[[:space:]]*$'";
  return `(CASE WHEN (${e})::text ~ ${pattern} THEN ((${e})::text)::numeric ELSE NULL END)`;
}

/** Devuelve el índice de la ")" que cierra la "(" en openParenIndex, respetando paréntesis anidados y comillas. */
export function findMatchingCloseParen(expr: string, openParenIndex: number): number {
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

/** Funciones cuyos argumentos son numéricos: se aplica coerceNumericSqlExpr a cada argumento para evitar text * text en Postgres. */
const FUNCS_COERCE_NUMERIC_ARGS = new Set([
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "POWER",
  "ABS",
  "ROUND",
  "CEIL",
  "CEILING",
  "FLOOR",
  "TRUNC",
  "SIGN",
  "SQRT",
  "LN",
  "LOG",
  "LOG10",
  "EXP",
  "MOD",
  "GREATEST",
  "LEAST",
]);

/** Primera aparición de `keyword` (WHEN/THEN/ELSE/END) en profundidad de paréntesis 0, fuera de literales. */
function findSqlKeywordAtDepthZero(s: string, from: number, keyword: "WHEN" | "THEN" | "ELSE" | "END"): number {
  let depth = 0;
  let inQuote: "'" | '"' | null = null;
  for (let i = from; i < s.length; i++) {
    const c = s[i]!;
    if (inQuote) {
      if (c === inQuote && s[i - 1] !== "\\") inQuote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      inQuote = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (depth !== 0) continue;
    const j = skipWsSql(s, i);
    if (matchSqlKeywordAt(s, j, keyword)) return j;
  }
  return -1;
}

function splitCommaArgsDepthZero(inner: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  let inQuote: "'" | '"' | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!;
    if (inQuote) {
      if (c === inQuote && inner[i - 1] !== "\\") inQuote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      inQuote = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      args.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(inner.slice(start).trim());
  return args.filter(Boolean);
}

function isUnaryPlusOrMinus(s: string, i: number, sign: "+" | "-"): boolean {
  if (s[i] !== sign) return false;
  let j = i - 1;
  while (j >= 0 && /\s/.test(s[j]!)) j--;
  if (j < 0) return true;
  const prev = s[j]!;
  return prev === "(" || prev === "," || prev === "+" || prev === "-" || prev === "*" || prev === "/";
}

/** Último `+` o `-` binario en profundidad 0. */
function splitAdditiveSql(s: string): { left: string; op: string; right: string } | null {
  let last = -1;
  let op = "";
  let depth = 0;
  let inQuote: "'" | '"' | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inQuote) {
      if (c === inQuote && s[i - 1] !== "\\") inQuote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      inQuote = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (depth !== 0) continue;
    if (c === "+" && !isUnaryPlusOrMinus(s, i, "+")) {
      last = i;
      op = "+";
    } else if (c === "-" && !isUnaryPlusOrMinus(s, i, "-")) {
      last = i;
      op = "-";
    }
  }
  if (last === -1) return null;
  return { left: s.slice(0, last).trim(), op, right: s.slice(last + 1).trim() };
}

/** Último `*` o `/` binario en profundidad 0. */
function splitMultiplicativeSql(s: string): { left: string; op: string; right: string } | null {
  let last = -1;
  let op = "";
  let depth = 0;
  let inQuote: "'" | '"' | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inQuote) {
      if (c === inQuote && s[i - 1] !== "\\") inQuote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      inQuote = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (depth !== 0) continue;
    if (c === "*" || c === "/") {
      last = i;
      op = c;
    }
  }
  if (last === -1) return null;
  return { left: s.slice(0, last).trim(), op, right: s.slice(last + 1).trim() };
}

function tryCoerceNumericFuncCall(s: string): string | null {
  const t = s.trim();
  const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (!m || m.index === undefined) return null;
  const name = m[1]!.toUpperCase();
  if (!FUNCS_COERCE_NUMERIC_ARGS.has(name)) return null;
  const openIdx = m.index + m[0].length - 1;
  const closeIdx = findMatchingCloseParen(t, openIdx);
  if (closeIdx === -1 || closeIdx !== t.length - 1) return null;
  const inner = t.slice(openIdx + 1, closeIdx).trim();
  const args = splitCommaArgsDepthZero(inner);
  const coerced = args.map((a) => coerceNumericSqlExpr(a.trim()));
  return `${name}(${coerced.join(", ")})`;
}

function tryCoerceCaseWhenSql(s: string): string | null {
  let t = s.trim();
  while (t.startsWith("(") && findMatchingCloseParen(t, 0) === t.length - 1) {
    t = t.slice(1, -1).trim();
  }
  if (!matchSqlKeywordAt(t, skipWsSql(t, 0), "CASE")) return null;
  let i = skipWsSql(t, 0) + 4;
  const parts: string[] = ["CASE"];

  while (true) {
    i = skipWsSql(t, i);
    if (matchSqlKeywordAt(t, i, "WHEN")) {
      const afterWhen = skipWsSql(t, i + 4);
      const thenIdx = findSqlKeywordAtDepthZero(t, afterWhen, "THEN");
      if (thenIdx === -1) return null;
      const cond = t.slice(afterWhen, thenIdx).trim();
      const afterThen = skipWsSql(t, thenIdx + 4);
      const boundary = findThenBranchBoundary(t, afterThen);
      if (boundary === -1) return null;
      const thenVal = t.slice(afterThen, boundary).trim();
      parts.push(`WHEN ${cond} THEN ${coerceNumericSqlExpr(thenVal)}`);
      i = boundary;
      continue;
    }
    if (matchSqlKeywordAt(t, i, "ELSE")) {
      const afterElse = skipWsSql(t, i + 4);
      const endIdx = findElseBranchClosingEnd(t, afterElse);
      if (endIdx === -1) return null;
      const elseVal = t.slice(afterElse, endIdx).trim();
      parts.push(`ELSE ${coerceNumericSqlExpr(elseVal)}`);
      parts.push(t.slice(endIdx).trim());
      return parts.join(" ");
    }
    if (matchSqlKeywordAt(t, i, "END")) {
      parts.push(t.slice(i).trim());
      return parts.join(" ");
    }
    return null;
  }
}

/**
 * Tras expressionToSql: envuelve columnas citadas que participan en aritmética (y args numéricos de SUM/AVG/…) con safeNumericCast.
 * Evita el error Postgres «operator does not exist: text * text» sin castear condiciones WHEN de CASE.
 */
function coerceNumericSqlExpr(s: string): string {
  let t = s.trim();
  if (!t) return t;

  while (t.startsWith("(") && findMatchingCloseParen(t, 0) === t.length - 1) {
    t = t.slice(1, -1).trim();
  }

  if (/^"[^"]+"$/.test(t)) return safeNumericCast(t);

  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return t;

  if (/^(NULL|TRUE|FALSE)$/i.test(t)) return t;

  if (t.startsWith("'")) return t;

  const caseSql = tryCoerceCaseWhenSql(t);
  if (caseSql !== null) return caseSql;

  const fnSql = tryCoerceNumericFuncCall(t);
  if (fnSql !== null) return fnSql;

  const add = splitAdditiveSql(t);
  if (add) return `${coerceNumericSqlExpr(add.left)} ${add.op} ${coerceNumericSqlExpr(add.right)}`;

  const mul = splitMultiplicativeSql(t);
  if (mul) return `${coerceNumericSqlExpr(mul.left)} ${mul.op} ${coerceNumericSqlExpr(mul.right)}`;

  return t;
}

export function coerceArithmeticOperandsToNumeric(sql: string): string {
  return coerceNumericSqlExpr(sql.trim());
}
