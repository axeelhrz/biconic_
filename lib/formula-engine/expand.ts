import { extractParenContent, splitArgs } from "./helpers";

/** Convierte IF(cond, thenVal, elseVal) en CASE WHEN cond THEN thenVal ELSE elseVal END (soporta anidamiento por profundidad de paréntesis). */
export function expandIfToCaseWhen(expr: string): string {
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

/** Convierte IFS(cond1, val1, cond2, val2, ..., [default]) en CASE WHEN ... END. */
export function expandIfsToCaseWhen(expr: string): string {
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
export function expandAndOr(expr: string, fn: "AND" | "OR"): string {
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

/** IFERROR(val, fallback) -> COALESCE((val), (fallback)) (aprox.; no captura errores de ejecución SQL). */
export function expandIfError(expr: string): string {
  const trimmed = expr.trim();
  const startIdx = trimmed.search(/\bIFERROR\s*\(/i);
  if (startIdx === -1) return expr;
  const open = trimmed.indexOf("(", startIdx);
  const extracted = extractParenContent(trimmed, open);
  if (!extracted) return expr;
  const args = splitArgs(extracted.inner);
  if (args.length < 2) return expr;
  const a = expandIfError(args[0]!);
  const b = expandIfError(args[1]!);
  const repl = `(COALESCE((${a}), (${b})))`;
  return trimmed.slice(0, startIdx) + repl + trimmed.slice(extracted.endIndex + 1);
}

/** IFNA(val, na_val) -> COALESCE((val), (na_val)) */
export function expandIfNa(expr: string): string {
  const trimmed = expr.trim();
  const startIdx = trimmed.search(/\bIFNA\s*\(/i);
  if (startIdx === -1) return expr;
  const open = trimmed.indexOf("(", startIdx);
  const extracted = extractParenContent(trimmed, open);
  if (!extracted) return expr;
  const args = splitArgs(extracted.inner);
  if (args.length < 2) return expr;
  const a = expandIfNa(args[0]!);
  const b = expandIfNa(args[1]!);
  const repl = `(COALESCE((${a}), (${b})))`;
  return trimmed.slice(0, startIdx) + repl + trimmed.slice(extracted.endIndex + 1);
}

/** XOR(cond1, cond2, ...) — verdadero si un número impar de argumentos es verdadero (estilo Excel). */
export function expandXor(expr: string): string {
  const trimmed = expr.trim();
  const xorStart = trimmed.search(/\bXOR\s*\(/i);
  if (xorStart === -1) return expr;
  const open = trimmed.indexOf("(", xorStart);
  const extracted = extractParenContent(trimmed, open);
  if (!extracted) return expr;
  const args = splitArgs(extracted.inner);
  if (args.length < 1) return expr;
  const parts = args.map((a) => `(CASE WHEN ${expandXor(a)} THEN 1 ELSE 0 END)`);
  const sum = parts.join(" + ");
  const repl = `(((${sum}))::int % 2 = 1)`;
  return trimmed.slice(0, xorStart) + repl + trimmed.slice(extracted.endIndex + 1);
}

/** SWITCH(expr, v1, r1, v2, r2, ... [, default]) */
export function expandSwitch(expr: string): string {
  const trimmed = expr.trim();
  const swStart = trimmed.search(/\bSWITCH\s*\(/i);
  if (swStart === -1) return expr;
  const open = trimmed.indexOf("(", swStart);
  const extracted = extractParenContent(trimmed, open);
  if (!extracted) return expr;
  const args = splitArgs(extracted.inner);
  if (args.length < 3) return expr;
  const switchExpr = expandSwitch(args[0]!);
  const rest = args.slice(1);
  let defaultVal = "NULL";
  let pairs: { val: string; res: string }[] = [];
  if (rest.length % 2 === 1) {
    defaultVal = expandSwitch(rest[rest.length - 1]!);
    const pr = rest.slice(0, -1);
    for (let i = 0; i + 1 < pr.length; i += 2) {
      pairs.push({ val: expandSwitch(pr[i]!), res: expandSwitch(pr[i + 1]!) });
    }
  } else {
    for (let i = 0; i + 1 < rest.length; i += 2) {
      pairs.push({ val: expandSwitch(rest[i]!), res: expandSwitch(rest[i + 1]!) });
    }
  }
  if (pairs.length === 0) return expr;
  const whenParts = pairs
    .map((p) => `WHEN (${switchExpr}) IS NOT DISTINCT FROM (${p.val}) THEN ${p.res}`)
    .join(" ");
  const caseExpr = `(CASE ${whenParts} ELSE ${defaultVal} END)`;
  return trimmed.slice(0, swStart) + caseExpr + trimmed.slice(extracted.endIndex + 1);
}
