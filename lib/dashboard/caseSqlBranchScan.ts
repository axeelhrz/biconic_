/** Localizar límites de ramas THEN/ELSE en expresiones CASE … END con CASE anidados (sin confundir WHEN/END internos). */

export function skipWsSql(s: string, i: number): number {
  let j = i;
  while (j < s.length && /\s/.test(s[j]!)) j++;
  return j;
}

export function matchSqlKeywordAt(s: string, i: number, kw: string): boolean {
  if (i + kw.length > s.length) return false;
  if (s.slice(i, i + kw.length).toUpperCase() !== kw) return false;
  const before = i > 0 ? s[i - 1]! : " ";
  const after = s[i + kw.length];
  if (/[A-Za-z0-9_]/.test(before)) return false;
  if (after && /[A-Za-z0-9_]/.test(after)) return false;
  return true;
}

/**
 * Tras THEN, índice del primer WHEN / ELSE / END que pertenece al mismo CASE que el THEN
 * (ignora WHEN/ELSE/END de CASE anidados a profundidad de paréntesis 0).
 */
export function findThenBranchBoundary(t: string, afterThen: number): number {
  let i = afterThen;
  let depth = 0;
  let inQuote: "'" | '"' | null = null;
  let nestedCase = 0;
  while (i < t.length) {
    const c = t[i]!;
    if (inQuote) {
      if (c === inQuote && t[i - 1] !== "\\") inQuote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      inQuote = c;
      i++;
      continue;
    }
    if (c === "(") {
      depth++;
      i++;
      continue;
    }
    if (c === ")") {
      depth--;
      i++;
      continue;
    }
    if (depth !== 0) {
      i++;
      continue;
    }
    const j = skipWsSql(t, i);
    if (j > i) {
      i = j;
      continue;
    }
    if (matchSqlKeywordAt(t, j, "CASE")) {
      nestedCase++;
      i = j + 4;
      continue;
    }
    if (matchSqlKeywordAt(t, j, "END")) {
      if (nestedCase > 0) {
        nestedCase--;
        i = j + 3;
        continue;
      }
      return j;
    }
    if (nestedCase === 0 && matchSqlKeywordAt(t, j, "WHEN")) return j;
    if (nestedCase === 0 && matchSqlKeywordAt(t, j, "ELSE")) return j;
    i++;
  }
  return -1;
}

/** Tras ELSE, índice del END que cierra el CASE del ELSE (respeta CASE … END anidados). */
export function findElseBranchClosingEnd(t: string, afterElse: number): number {
  let i = afterElse;
  let depth = 0;
  let inQuote: "'" | '"' | null = null;
  let nestedCase = 0;
  while (i < t.length) {
    const c = t[i]!;
    if (inQuote) {
      if (c === inQuote && t[i - 1] !== "\\") inQuote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      inQuote = c;
      i++;
      continue;
    }
    if (c === "(") {
      depth++;
      i++;
      continue;
    }
    if (c === ")") {
      depth--;
      i++;
      continue;
    }
    if (depth !== 0) {
      i++;
      continue;
    }
    const j = skipWsSql(t, i);
    if (j > i) {
      i = j;
      continue;
    }
    if (matchSqlKeywordAt(t, j, "CASE")) {
      nestedCase++;
      i = j + 4;
      continue;
    }
    if (matchSqlKeywordAt(t, j, "END")) {
      if (nestedCase > 0) {
        nestedCase--;
        i = j + 3;
        continue;
      }
      return j;
    }
    i++;
  }
  return -1;
}
