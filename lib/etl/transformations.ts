import { v4 as uuidv4 } from "uuid";

// ===================================================================
// TIPOS Y DEFINICIONES (Copiados/Adaptados de run/route.ts)
// ===================================================================

export type CastTargetType =
  | "number"
  | "integer"
  | "decimal"
  | "string"
  | "boolean"
  | "date"
  | "datetime";

// Helper constants for Date parsing
const ES_MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const ES_MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

// ===================================================================
// UTILS
// ===================================================================

export function getValue(row: Record<string, any>, colName: string) {
  if (colName in row) return row[colName];
  const keys = Object.keys(row);
  const foundKey = keys.find(
    (k) =>
      k === colName || k.endsWith(`_${colName}`) || k.endsWith(`.${colName}`)
  );
  return foundKey ? row[foundKey] : undefined;
}

export function buildRegexFromPattern(pattern: string) {
  const groups: { token: string }[] = [];
  let src = "^";
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === "'") {
      let j = i + 1;
      let lit = "";
      while (j < pattern.length && pattern[j] !== "'") lit += pattern[j++];
      src += lit.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      i = j + 1;
      continue;
    }
    const rest = pattern.slice(i);
    const match = rest.startsWith("EEEE")
      ? "EEEE"
      : rest.startsWith("MMMM")
      ? "MMMM"
      : rest.startsWith("MMM")
      ? "MMM"
      : rest.startsWith("yyyy")
      ? "yyyy"
      : rest.startsWith("dd")
      ? "dd"
      : rest.startsWith("MM")
      ? "MM"
      : rest.startsWith("d")
      ? "d"
      : rest.startsWith("M")
      ? "M"
      : null;
    if (match) {
      groups.push({ token: match });
      switch (match) {
        case "EEEE":
        case "MMMM":
        case "MMM":
          src += "([A-Za-zÁÉÍÓÚáéíóúñÑ]+)";
          break;
        case "yyyy":
          src += "(\\d{4})";
          break;
        case "dd":
          src += "(\\d{2})";
          break;
        case "MM":
          src += "(\\d{2})";
          break;
        case "d":
          src += "(\\d{1,2})";
          break;
        case "M":
          src += "(\\d{1,2})";
          break;
      }
      i += match.length;
    } else {
      src += pattern[i].replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      i += 1;
    }
  }
  src += "$";
  return { regex: new RegExp(src, "i"), groups };
}

export function parseDateWithPattern(value: string, pattern?: string): Date | null {
  const s = (value ?? "").toString().trim();
  if (!s) return null;
  if (!pattern) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const { regex, groups } = buildRegexFromPattern(pattern);
  const m = s.match(regex);
  if (!m) return null;
  let day: number | undefined;
  let month: number | undefined;
  let year: number | undefined;
  let cursor = 1;
  for (const g of groups) {
    const part = m[cursor++] ?? "";
    switch (g.token) {
      case "dd":
      case "d":
        day = Number(part);
        break;
      case "MM":
      case "M":
        month = Number(part);
        break;
      case "MMM": {
        const idx = ES_MONTHS_SHORT.indexOf(part.toLowerCase());
        month = idx >= 0 ? idx + 1 : undefined;
        break;
      }
      case "MMMM": {
        const idx = ES_MONTHS.indexOf(part.toLowerCase());
        month = idx >= 0 ? idx + 1 : undefined;
        break;
      }
      case "yyyy":
        year = Number(part);
        break;
      case "EEEE":
        break;
    }
  }
  if (!year || !month || !day) return null;
  const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  return isNaN(d.getTime()) ? null : d;
}

// ===================================================================
// ARITHMETIC
// ===================================================================

export function applyArithmeticOperations(
  rows: Record<string, any>[],
  config: {
    operations: Array<{
      id: string;
      leftOperand: { type: "column" | "constant"; value: string };
      operator: "+" | "-" | "*" | "/" | "%" | "^";
      rightOperand: { type: "column" | "constant"; value: string };
      resultColumn: string;
    }>;
  }
): Record<string, any>[] {
  if (!config?.operations?.length) return rows;

  if (rows.length > 0) {
    // console.log(`[ARITHMETIC DEBUG] Key check row[0]:`, Object.keys(rows[0]));
  }

  const parseNum = (val: any): number => {
    if (typeof val === "number") return val;
    if (val == null || val === "") return 0;
    const s = String(val).trim();
    // Simplified parsing logic
    const norm = s
      .replace(/\s+/g, "")
      .replace(/\.(?=.*\.)/g, "")
      .replace(/,(?=\d{1,2}$)/, ".")
      .replace(/[^0-9.\-]/g, "");
    const n = Number(norm);
    return isNaN(n) ? 0 : n;
  };

  return rows.map((row) => {
    const newRow = { ...row };
    const keys = Object.keys(newRow);

    const getValAndKey = (colName: string) => {
      if (colName in newRow) return { val: newRow[colName], key: colName };
      const foundKey = keys.find(
        (k) =>
          k === colName ||
          k.endsWith(`_${colName}`) ||
          k.endsWith(`.${colName}`)
      );
      if (foundKey) return { val: newRow[foundKey], key: foundKey };
      return { val: undefined, key: null };
    };

    for (const op of config.operations) {
      let rawLeft: any;
      if (op.leftOperand.type === "column") {
        const res = getValAndKey(op.leftOperand.value);
        rawLeft = res.val;
      } else {
        rawLeft = op.leftOperand.value;
      }
      const leftVal = parseNum(rawLeft);

      let rawRight: any;
      if (op.rightOperand.type === "column") {
        const res = getValAndKey(op.rightOperand.value);
        rawRight = res.val;
      } else {
        rawRight = op.rightOperand.value;
      }
      const rightVal = parseNum(rawRight);

      let result: number;
      switch (op.operator) {
        case "+": result = leftVal + rightVal; break;
        case "-": result = leftVal - rightVal; break;
        case "*": result = leftVal * rightVal; break;
        case "/": result = rightVal !== 0 ? leftVal / rightVal : 0; break;
        case "%": result = rightVal !== 0 ? leftVal % rightVal : 0; break;
        case "^": result = Math.pow(leftVal, rightVal); break;
        default: result = 0;
      }
      newRow[op.resultColumn] = result;
    }
    return newRow;
  });
}

// ===================================================================
// CLEAN TRIANSFORMS
// ===================================================================

export function applyTransforms(
  row: Record<string, any>,
  config: {
    transforms: Array<
      | { column: string; op: "trim" | "upper" | "lower" | "cast_number" | "cast_date" }
      | { column: string; op: "replace"; find: string; replaceWith: string }
    >;
  } | undefined
) {
  if (!config?.transforms?.length) return row;
  const next: Record<string, any> = { ...row };
  for (const t of config.transforms) {
    const v = next[t.column];
    switch (t.op) {
      case "trim":
        next[t.column] = typeof v === "string" ? v.trim() : v;
        break;
      case "upper":
        next[t.column] = typeof v === "string" ? v.toUpperCase() : v;
        break;
      case "lower":
        next[t.column] = typeof v === "string" ? v.toLowerCase() : v;
        break;
      case "replace":
        if (typeof v === "string" && "find" in t) {
          const regex = new RegExp(t.find, "g");
          next[t.column] = v.replace(regex, t.replaceWith);
        }
        break;
      case "cast_number":
        next[t.column] =
          v == null || v === "" || isNaN(Number(v)) ? null : Number(v);
        break;
      case "cast_date":
        {
          const d = v ? new Date(v) : null;
          next[t.column] = d && !isNaN(d.getTime()) ? d.toISOString() : null;
        }
        break;
    }
  }
  return next;
}

// ===================================================================
// CAST
// ===================================================================

export function applyCastConversions(
  rows: Record<string, any>[],
  config: {
    conversions: Array<{
      column: string;
      targetType: CastTargetType;
      inputFormat?: string | null;
      outputFormat?: string | null;
    }>;
  }
) {
  if (!config?.conversions?.length) return rows;
  return rows.map((row) => {
    const out: Record<string, any> = { ...row };
    const keys = Object.keys(out);
    const resolveTargets = (simple: string) => {
      const matches = keys.filter(
        (k) => k === simple || k.endsWith(`_${simple}`)
      );
      return matches.length ? matches : keys.includes(simple) ? [simple] : [];
    };
    for (const cv of config.conversions) {
      const targets = resolveTargets(cv.column);
      for (const key of targets) {
        const v = out[key];
        switch (cv.targetType) {
          case "string":
            out[key] = v == null ? null : String(v);
            break;
          case "number":
          case "decimal": {
            const s = (v ?? "").toString().trim();
            const norm = s
              .replace(/\s+/g, "")
              .replace(/\.(?=.*\.)/g, "")
              .replace(/,(?=\d{1,2}$)/, ".")
              .replace(/[^0-9.\-]/g, "");
            const n = norm ? Number(norm) : NaN;
            out[key] = isNaN(n) ? null : n;
            break;
          }
          case "integer": {
            const s = (v ?? "").toString().trim();
            const norm = s
              .replace(/\s+/g, "")
              .replace(/[.,](?=\d{1,2}$)/, ".")
              .replace(/[^0-9.\-]/g, "");
            const n = norm ? Math.trunc(Number(norm)) : NaN;
            out[key] = isNaN(n) ? null : n;
            break;
          }
          case "boolean": {
            const sv = (v ?? "").toString().trim().toLowerCase();
            out[key] = ["true", "t", "1", "yes", "y", "si", "sí"].includes(sv)
              ? true
              : ["false", "f", "0", "no", "n"].includes(sv)
              ? false
              : null;
            break;
          }
          case "date": {
            const d = parseDateWithPattern(
              String(v ?? ""),
              cv.inputFormat || undefined
            );
            out[key] = d ? `${d.toISOString().slice(0, 10)}` : null;
            break;
          }
          case "datetime": {
            const d = parseDateWithPattern(
              String(v ?? ""),
              cv.inputFormat || undefined
            );
            out[key] = d ? d.toISOString() : null;
            break;
          }
        }
      }
    }
    return out;
  });
}

// ===================================================================
// CONDITION
// ===================================================================

export function applyConditionRules(
  rows: Record<string, any>[],
  config: {
    rules: Array<{
      id: string;
      leftOperand?: { type: "column" | "constant"; value: string };
      rightOperand?: { type: "column" | "constant"; value: string };
      comparator?: string;
      resultColumn?: string;
      outputType?: "boolean" | "string" | "number";
      thenValue?: string;
      elseValue?: string;
      shouldFilter?: boolean;
    }>;
  }
): Record<string, any>[] {
  if (!config?.rules?.length) return rows;

  return rows.reduce<Record<string, any>[]>((acc, row) => {
    const newRow = { ...row };
    let keepRow = true;

    for (const rule of config.rules) {
      // rule structure matches Frontend Widget
      const leftValRaw = rule.leftOperand?.type === "column"
          ? newRow[rule.leftOperand.value]
          : rule.leftOperand?.value;

      const rightValRaw = rule.rightOperand?.type === "column"
          ? newRow[rule.rightOperand.value]
          : rule.rightOperand?.value;

      const nLeft = Number(leftValRaw);
      const nRight = Number(rightValRaw);
      const isNum = !isNaN(nLeft) && !isNaN(nRight) && 
                    leftValRaw !== "" && rightValRaw !== "" && 
                    leftValRaw !== null && rightValRaw !== null;

      const sLeft = String(leftValRaw ?? "");
      const sRight = String(rightValRaw ?? "");

      let conditionMet = false;

      switch (rule.comparator) {
        case "=":
          conditionMet = isNum ? nLeft === nRight : sLeft === sRight;
          break;
        case "!=":
          conditionMet = isNum ? nLeft !== nRight : sLeft !== sRight;
          break;
        case ">":
          conditionMet = isNum ? nLeft > nRight : sLeft > sRight;
          break;
        case ">=":
          conditionMet = isNum ? nLeft >= nRight : sLeft >= sRight;
          break;
        case "<":
          conditionMet = isNum ? nLeft < nRight : sLeft < sRight;
          break;
        case "<=":
          conditionMet = isNum ? nLeft <= nRight : sLeft <= sRight;
          break;
        default:
          conditionMet = false;
      }

      if (rule.shouldFilter && !conditionMet) {
        keepRow = false;
        break; 
      }

      if (rule.outputType && rule.resultColumn) {
        if (rule.outputType === "boolean") {
           newRow[rule.resultColumn] = conditionMet;
        } else {
           newRow[rule.resultColumn] = conditionMet 
              ? rule.thenValue 
              : rule.elseValue;
        }
      }
    }

    if (keepRow) {
      acc.push(newRow);
    }
    return acc;
  }, []);
}

// ===================================================================
// COUNT AGGREGATION
// ===================================================================

export function applyCountAggregation(
  rows: Record<string, any>[],
  config: { attribute: string; resultColumn?: string }
): Record<string, any>[] {
  if (!config?.attribute) return rows;
  const attr = config.attribute;
  const resultColumn = config.resultColumn?.trim() || "conteo";
  const map = new Map<string, number>();
  const originalValues = new Map<string, any>();

  for (const r of rows) {
    const val = getValue(r, attr);
    const key = val == null ? "__NULL__" : String(val);
    map.set(key, (map.get(key) || 0) + 1);
    if (!originalValues.has(key)) originalValues.set(key, val);
  }
  const out: Record<string, any>[] = [];
  for (const [key, cnt] of map.entries()) {
    out.push({ [attr]: originalValues.get(key), [resultColumn]: cnt });
  }
  out.sort((a, b) => {
    const d = (b[resultColumn] || 0) - (a[resultColumn] || 0);
    if (d !== 0) return d;
    const av = a[attr];
    const bv = b[attr];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return String(av).localeCompare(String(bv));
  });
  return out;
}
