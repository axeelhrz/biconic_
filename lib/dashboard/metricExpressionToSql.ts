/** Columna calculada (nombre + expresión sobre columnas + agregación por defecto). */
export interface DerivedColumnRef {
  name: string;
  expression: string;
  defaultAggregation: string;
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
export function quotedColumn(name: string): string {
  const physical = displayColumnToPhysical(name);
  const s = physical.replace(/"/g, '""').toLowerCase();
  return s ? `"${s}"` : '""';
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

/** Si el fragmento ya es CASE … sin paréntesis envolventes, lo envuelve para que escáneres/SQL no confundan WHEN/END anidados. */
function wrapBareCaseFragment(expanded: string): string {
  const t = expanded.trim();
  if (!/\bCASE\s/i.test(t)) return expanded;
  if (t[0] === "(") {
    const ex = extractParenContent(t, 0);
    if (ex && ex.endIndex === t.length - 1) return expanded;
  }
  return `(${t})`;
}

/** Literal de texto estilo hoja de cálculo: comillas simples o dobles sin escapado interno. */
function isSpreadsheetQuotedString(arg: string): boolean {
  const t = arg.trim();
  if (/^'[^']*'$/.test(t)) return true;
  if (/^"[^"]*"$/.test(t)) return true;
  return false;
}

/**
 * True si la expresión (tras trim y `;` → `,`) es solo una llamada `IFS(...)` y cada valor de rama
 * (cada segundo argumento del par + el default opcional) es un literal entre comillas.
 * Ese `CASE` en SQL es de tipo texto: SUM/AVG en Postgres fallan (`function sum(text) does not exist`).
 */
export function ifsYieldsOnlyTextLiterals(expression: string): boolean {
  let s = (expression || "").replace(/\s+/g, " ").trim().replace(/;/g, ",");
  if (!s) return false;
  const ifsStart = s.search(/\bIFS\s*\(/i);
  if (ifsStart === -1 || ifsStart !== 0) return false;
  const open = s.indexOf("(", ifsStart);
  if (open === -1) return false;
  const extracted = extractParenContent(s, open);
  if (!extracted) return false;
  const tail = s.slice(extracted.endIndex + 1).trim();
  if (tail.length > 0) return false;
  const args = splitArgs(extracted.inner);
  if (args.length < 2) return false;
  let i = 0;
  while (i + 1 < args.length) {
    if (!isSpreadsheetQuotedString(args[i + 1]!)) return false;
    i += 2;
  }
  if (i < args.length && !isSpreadsheetQuotedString(args[i]!)) return false;
  return true;
}

/**
 * SUM/AVG sobre una expresión que es solo `IFS(...)` con ramas entre comillas (tipo texto en SQL)
 * no es válido en Postgres. Para etiquetas por grupo se usa `MAX` (si el grupo tiene un solo valor
 * de etiqueta, MAX y MIN coinciden con ese valor).
 */
export function coerceAggFuncForTextOnlyIFS(func: string, expression: string): string {
  const f = (func || "SUM").toString().toUpperCase().trim();
  if (!expression.trim()) return f;
  if ((f === "SUM" || f === "AVG") && ifsYieldsOnlyTextLiterals(expression)) return "MAX";
  return f;
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
      else if (secondComma === -1) secondComma = i;
    }
  }
  if (firstComma === -1 || secondComma === -1) return expr;
  const cond = trimmed.slice(start + 1, firstComma).trim();
  const thenVal = trimmed.slice(firstComma + 1, secondComma).trim();
  const elseVal = trimmed.slice(secondComma + 1, i).trim();
  const caseExpr = `(CASE WHEN ${wrapBareCaseFragment(expandIfToCaseWhen(cond))} THEN ${wrapBareCaseFragment(expandIfToCaseWhen(thenVal))} ELSE ${wrapBareCaseFragment(expandIfToCaseWhen(elseVal))} END)`;
  return trimmed.slice(0, ifStart) + caseExpr + trimmed.slice(i + 1);
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
  const whenParts = pairs
    .map(
      (p) =>
        `WHEN ${wrapBareCaseFragment(expandIfsToCaseWhen(p.cond))} THEN ${wrapBareCaseFragment(expandIfsToCaseWhen(p.val))}`
    )
    .join(" ");
  const caseExpr = `(CASE ${whenParts} ELSE ${wrapBareCaseFragment(expandIfsToCaseWhen(defaultVal))} END)`;
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

/**
 * Evita «operator does not exist: text = integer» cuando la columna ETL es `text` y el usuario
 * escribe `codigoarticulo=999999` (literal sin comillas). Reescribe `"col" = 999` → `"col" = '999'`.
 */
function normalizeNumericComparisonLiterals(sql: string): string {
  return sql.replace(
    /("[^"]+")\s*(<=|>=|<>|!=|=|<|>)\s*(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\b/g,
    (_m, col: string, op: string, num: string) => `${col}${op}'${num}'`
  );
}

/** Convierte expresión sobre columnas (ej. "CANTIDAD * PRECIO_UNITARIO", IF(ESTADO='PAGADO',1,0)) en SQL seguro.
 *  - Literales numéricos y cadenas entre comillas se preservan (incl. Unicode en comillas, p. ej. 'México').
 *  - El whitelist de caracteres se aplica al esqueleto tras sustituir literales por placeholders (evita rechazar tildes en texto).
 *  - ; se normaliza a , (estilo Excel).
 *  - AVERAGE( -> AVG(, LEN( -> LENGTH(, MID( -> SUBSTRING(.
 *  - IF(cond, then, else) se convierte en CASE WHEN ... THEN ... ELSE ... END.
 *  - Funciones SQL conocidas se preservan.
 *  - Nombres de columnas calculadas (derivedLookup) se expanden a su expresión.
 *  - Demás identificadores se pasan a quotedColumn.
 */
export function expressionToSql(
  expression: string,
  derivedLookup?: Record<string, DerivedColumnRef>,
  _depth = 0
): string | null {
  if (!expression || typeof expression !== "string") return null;
  let s = expression.replace(/\s+/g, " ").trim();
  if (!s) return null;
  // Normalizar comillas tipográficas/Unicode a comillas rectas (evita fallos con IF(primary.X="FB";...))
  s = s.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"').replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'");
  // Proteger cadenas entre comillas antes del whitelist: [a-zA-Z] es solo ASCII; literales como 'México' deben enmascararse primero.
  const stringLiterals: string[] = [];
  s = s.replace(/'([^']*)'|"([^"]*)"/g, (_, single, double) => {
    const content = single !== undefined ? single : double;
    const idx = stringLiterals.length;
    stringLiterals.push(content.replace(/'/g, "''"));
    return `__STR${idx}__`;
  });
  // Permitir literales: números, placeholders __STRn__, ^ = <> ! para comparaciones; comillas solo en esqueleto residual.
  const allowed = /^[a-zA-Z0-9_*+\-/().,\s'"%;^=<>!]+$/;
  if (!allowed.test(s)) return null;

  // 0) Normalizar ; a , (Excel usa ; como separador de argumentos)
  s = s.replace(/;/g, ",");

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

  return normalizeNumericComparisonLiterals(withStrings) || null;
}
