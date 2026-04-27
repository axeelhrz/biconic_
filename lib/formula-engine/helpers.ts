import type { SqlDialect } from "./types";

export function toSqlLiteral(v: unknown): string {
  if (v === null || typeof v === "undefined") return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

/** Convierte nombre de columna del front (primary.COL, join_N.COL) al nombre físico en la tabla ETL (primary_col, join_n_col). */
export function displayColumnToPhysical(name: string): string {
  let n = (name || "").trim();
  if (n.length >= 2 && n.startsWith('"') && n.endsWith('"')) n = n.slice(1, -1).replace(/""/g, '"');
  if (/^primary\.[a-zA-Z_][a-zA-Z0-9_]*$/i.test(n))
    return "primary_" + n.slice(8).replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  const joinMatch = n.match(/^join_(\d+)\.[a-zA-Z_][a-zA-Z0-9_]*$/i);
  if (joinMatch)
    return `join_${joinMatch[1]}_` + n.slice(joinMatch[0].indexOf(".") + 1).replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  return n.replace(/"/g, '""').toLowerCase();
}

/** En Postgres los identificadores sin comillas se guardan en minúsculas; normalizar para que "ID" coincida con "id". */
export function quotedColumn(name: string): string {
  const physical = displayColumnToPhysical(name);
  const s = physical.replace(/"/g, '""').toLowerCase();
  return s ? `"${s}"` : '""';
}

/** Cotiza identificador simple para uso en outer query del nodo aritmético (sin mapeo primary.). */
export function quoteSimpleIdent(name: string, dialect: SqlDialect): string {
  const safe = name.replace(/"/g, '""').replace(/`/g, "``");
  return dialect === "postgres" ? `"${safe}"` : `\`${safe}\``;
}

/** Verifica paréntesis balanceados (ignora los que están dentro de comillas). Devuelve mensaje de error o null si está bien. */
export function checkBalancedParens(expr: string): string | null {
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

/** Extrae el contenido entre paréntesis balanceados a partir de start (el índice del "("). Devuelve { inner, endIndex }. */
export function extractParenContent(s: string, start: number): { inner: string; endIndex: number } | null {
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

/** Divide el contenido de argumentos por comas respetando paréntesis y comillas. */
export function splitArgs(content: string): string[] {
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
export function parseCriterion(crit: string): { op: string; valueStr: string } {
  const t = crit.trim();
  const match = t.match(/^(\<\>|\>\=|\<\=|\>|\<|\=)?\s*([\s\S]*)$/);
  const op = (match?.[1] ?? "=").replace(/\s/g, "");
  const valueStr = (match?.[2] ?? t).trim();
  return { op: op || "=", valueStr };
}

/** Encuentra el índice del operador "/" de división a nivel top (depth 0), respetando paréntesis y comillas. */
export function findTopLevelDivision(expr: string): number {
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

/** Encuentra `&` de concatenación Excel a profundidad 0 (fuera de paréntesis y comillas). */
export function findTopLevelAmpersand(expr: string): number {
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
    else if (c === "&" && depth === 0) return i;
  }
  return -1;
}
