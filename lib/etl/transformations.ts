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

const BOOLEAN_TRUES = ["true", "t", "1", "yes", "y", "si", "sí"];
const BOOLEAN_FALSES = ["false", "f", "0", "no", "n"];
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}(T|\s)/,
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/,
  /^\d{2,4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}$/,
];
const SAMPLE_SIZE = 200;

function sampleValues(
  rows: Record<string, any>[],
  columnName: string
): any[] {
  const out: any[] = [];
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const key =
    columnName in (rows[0] ?? {})
      ? columnName
      : keys.find(
          (k) =>
            k === columnName ||
            k.endsWith(`_${columnName}`) ||
            k.endsWith(`.${columnName}`)
        );
  if (!key) return out;
  for (const row of rows) {
    const v = row[key];
    if (v != null && v !== "") out.push(v);
    if (out.length >= SAMPLE_SIZE) break;
  }
  return out;
}

function inferSingleColumnType(values: any[]): CastTargetType {
  if (values.length === 0) return "string";
  let allBoolean = true;
  let allInteger = true;
  let allNumber = true;
  let dateLike = 0;
  for (const v of values) {
    const s = String(v).trim().toLowerCase();
    if (
      !BOOLEAN_TRUES.includes(s) &&
      !BOOLEAN_FALSES.includes(s) &&
      s !== ""
    )
      allBoolean = false;
    const n = Number(
      String(v)
        .replace(/\s+/g, "")
        .replace(",", ".")
    );
    if (isNaN(n) || s === "") {
      allNumber = false;
      allInteger = false;
    } else {
      if (n % 1 !== 0) allInteger = false;
    }
    const str = String(v).trim();
    if (DATE_PATTERNS.some((p) => p.test(str)) || !isNaN(Date.parse(str)))
      dateLike++;
  }
  if (allBoolean && values.length > 0) return "boolean";
  if (dateLike >= Math.min(values.length * 0.8, values.length))
    return "date";
  if (allInteger && values.length > 0) return "integer";
  if (allNumber && values.length > 0) return "number";
  return "string";
}

/**
 * Infiere el tipo de cada columna a partir de una muestra de filas.
 * Útil para sugerir conversiones en el nodo Cast (texto → número, texto → fecha, etc.).
 */
export function inferColumnTypes(
  rows: Record<string, any>[],
  columnNames?: string[]
): Array<{ column: string; inferredType: CastTargetType }> {
  if (!rows.length) return [];
  const names =
    columnNames ?? Object.keys(rows[0]).filter((k) => k && typeof k === "string");
  const result: Array<{ column: string; inferredType: CastTargetType }> = [];
  for (const col of names) {
    const values = sampleValues(rows, col);
    const inferredType = inferSingleColumnType(values);
    result.push({ column: col, inferredType });
  }
  return result;
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
      operator: "+" | "-" | "*" | "/" | "%" | "^" | "pct_of" | "pct_off";
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
// CLEAN TRANSFORMS & DATA QUALITY
// ===================================================================

export type CleanTransform =
  | { column: string; op: "trim" | "upper" | "lower" | "cast_number" | "cast_date" }
  | { column: string; op: "replace"; find: string; replaceWith: string }
  | { column: string; op: "replace_value"; find: string; replaceWith: string }
  | { column: string; op: "normalize_nulls"; patterns: string[]; action: "null" | "replace"; replacement?: string }
  | { column: string; op: "normalize_spaces" }
  | { column: string; op: "strip_invisible" }
  | { column: string; op: "utf8_normalize" };

export type CleanConfig = {
  transforms: CleanTransform[];
  dedupe?: { keyColumns: string[]; keep: "first" | "last" };
};

function isNullLike(value: any, patterns: string[]): boolean {
  if (value == null) return true;
  const s = String(value).trim();
  if (s === "") return true;
  return patterns.some((p) => p === s || (p === "" && s === ""));
}

export function applyTransforms(
  row: Record<string, any>,
  config: { transforms: CleanTransform[] } | undefined
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
          try {
            const regex = new RegExp(t.find, "g");
            next[t.column] = v.replace(regex, t.replaceWith);
          } catch {
            next[t.column] = v;
          }
        }
        break;
      case "replace_value":
        if ("find" in t && "replaceWith" in t && String(v) === t.find) {
          next[t.column] = t.replaceWith;
        }
        break;
      case "normalize_nulls":
        if ("patterns" in t && isNullLike(v, t.patterns)) {
          next[t.column] = t.action === "replace" && t.replacement !== undefined ? t.replacement : null;
        }
        break;
      case "normalize_spaces":
        if (typeof v === "string") {
          next[t.column] = v.replace(/\s+/g, " ").trim();
        }
        break;
      case "strip_invisible":
        if (typeof v === "string") {
          next[t.column] = v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
        }
        break;
      case "utf8_normalize":
        if (typeof v === "string") {
          next[t.column] = v.normalize("NFC");
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

export function applyDedupe(
  rows: Record<string, any>[],
  keyColumns: string[],
  keep: "first" | "last"
): Record<string, any>[] {
  if (!keyColumns?.length || rows.length === 0) return rows;
  const seen = new Map<string, number>();
  const order = keep === "first" ? rows.map((_, i) => i) : rows.map((_, i) => rows.length - 1 - i);
  const toKeep = new Set<number>();
  for (const i of order) {
    const row = rows[i];
    const key = keyColumns.map((col) => {
      const val = row[col];
      return val == null ? "__NULL__" : String(val);
    }).join("\x00");
    if (!seen.has(key)) {
      seen.set(key, i);
      toKeep.add(i);
    }
  }
  return rows.filter((_, i) => toKeep.has(i));
}

export function applyCleanBatch(
  rows: Record<string, any>[],
  config: CleanConfig | undefined
): Record<string, any>[] {
  if (!config?.transforms?.length && !config?.dedupe?.keyColumns?.length) return rows;
  let out = rows.map((r) => applyTransforms(r, config));
  if (config?.dedupe?.keyColumns?.length) {
    out = applyDedupe(out, config.dedupe.keyColumns, config.dedupe.keep ?? "first");
  }
  return out;
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

function evalCondition(
  rule: {
    leftOperand?: { type: "column" | "constant"; value: string };
    rightOperand?: { type: "column" | "constant"; value: string };
    comparator?: string;
  },
  row: Record<string, any>
): boolean {
  const leftValRaw =
    rule.leftOperand?.type === "column"
      ? getValue(row, rule.leftOperand.value)
      : rule.leftOperand?.value;
  const rightValRaw =
    rule.rightOperand?.type === "column"
      ? getValue(row, rule.rightOperand.value)
      : rule.rightOperand?.value;

  const nLeft = Number(leftValRaw);
  const nRight = Number(rightValRaw);
  const isNum =
    !isNaN(nLeft) &&
    !isNaN(nRight) &&
    leftValRaw !== "" &&
    rightValRaw !== "" &&
    leftValRaw !== null &&
    rightValRaw !== null;

  const sLeft = String(leftValRaw ?? "").trim();
  const sRight = String(rightValRaw ?? "").trim();

  switch (rule.comparator) {
    case "=":
      return isNum ? nLeft === nRight : sLeft === sRight;
    case "!=":
      return isNum ? nLeft !== nRight : sLeft !== sRight;
    case ">":
      return isNum ? nLeft > nRight : sLeft > sRight;
    case ">=":
      return isNum ? nLeft >= nRight : sLeft >= sRight;
    case "<":
      return isNum ? nLeft < nRight : sLeft < sRight;
    case "<=":
      return isNum ? nLeft <= nRight : sLeft <= sRight;
    default:
      return false;
  }
}

export function applyConditionRules(
  rows: Record<string, any>[],
  config: {
    resultColumn?: string;
    defaultResultValue?: string;
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

  const useFirstMatch =
    config.resultColumn != null && config.resultColumn !== "";

  return rows.reduce<Record<string, any>[]>((acc, row) => {
    const newRow = { ...row };
    let keepRow = true;

    if (useFirstMatch) {
      let assigned = false;
      for (const rule of config.rules) {
        if (evalCondition(rule, newRow)) {
          const val =
            rule.outputType === "boolean"
              ? true
              : rule.thenValue ?? "";
          newRow[config.resultColumn!] = val;
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        newRow[config.resultColumn!] =
          config.defaultResultValue ?? null;
      }
    } else {
      for (const rule of config.rules) {
        const conditionMet = evalCondition(rule, newRow);

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
