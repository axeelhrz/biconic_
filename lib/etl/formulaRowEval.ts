/**
 * Evaluación acotada de expresiones estilo Excel por fila (preview/run en memoria).
 * Para SQL completo usar arithmetic-query con {@link expressionToSql}.
 */
import { extractParenContent, splitArgs } from "@/lib/formula-engine";

const RESERVED = new Set([
  "true",
  "false",
  "null",
  "undefined",
  "nan",
  "infinity",
  "and",
  "or",
  "not",
  "constructor",
  "__proto__",
  "prototype",
  "function",
  "return",
]);

function replaceColumnRefs(expr: string, row: Record<string, unknown>): string {
  return expr.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g, (full, id: string) => {
    const low = id.toLowerCase();
    if (RESERVED.has(low)) {
      if (low === "true") return "true";
      if (low === "false") return "false";
      if (low === "null") return "null";
      if (low === "and") return "&&";
      if (low === "or") return "||";
      if (low === "not") return "!";
      return full;
    }
    if (!Object.prototype.hasOwnProperty.call(row, id)) return "0";
    const v = row[id];
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "boolean") return v ? "true" : "false";
    const s = String(v ?? "").trim();
    const norm = s
      .replace(/\s+/g, "")
      .replace(/\.(?=.*\.)/g, "")
      .replace(/,(?=\d{1,2}$)/, ".")
      .replace(/[^0-9.\-]/g, "");
    const n = Number(norm);
    if (!Number.isNaN(n) && norm !== "") return String(n);
    return JSON.stringify(s);
  });
}

function evalTruthy(expr: string): boolean {
  try {
    const v = Function(`"use strict"; return (${expr});`)();
    return Boolean(v);
  } catch {
    return false;
  }
}

export function evalRowFormulaExpression(expression: string, row: Record<string, unknown>): unknown {
  const raw = (expression || "").trim();
  if (!raw) return null;

  if (/^IF\s*\(/i.test(raw)) {
    const open = raw.indexOf("(");
    const extracted = extractParenContent(raw, open);
    if (!extracted) return null;
    const args = splitArgs(extracted.inner);
    if (args.length < 2) return null;
    const condExpr = replaceColumnRefs(args[0]!.trim(), row);
    const thenExpr = args[1]!.trim();
    const elseExpr = (args[2] ?? "").trim() || "0";
    const pass = evalTruthy(condExpr);
    return pass ? evalRowFormulaExpression(thenExpr, row) : evalRowFormulaExpression(elseExpr, row);
  }

  const replaced = replaceColumnRefs(raw, row);
  try {
    return Function(`"use strict"; return (${replaced});`)();
  } catch {
    return null;
  }
}
