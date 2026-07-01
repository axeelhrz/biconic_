"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getValue = getValue;
exports.buildRegexFromPattern = buildRegexFromPattern;
exports.parseDateWithPattern = parseDateWithPattern;
exports.inferColumnTypes = inferColumnTypes;
exports.applyArithmeticOperations = applyArithmeticOperations;
exports.applyTransforms = applyTransforms;
exports.applyDedupe = applyDedupe;
exports.applyCleanBatch = applyCleanBatch;
exports.applyCastConversions = applyCastConversions;
exports.applyConditionRules = applyConditionRules;
exports.applyCountAggregation = applyCountAggregation;
const dateFormatting_1 = require("../dashboard/dateFormatting");
const ES_MONTHS = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const ES_MONTHS_SHORT = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
];
function getValue(row, colName) {
    if (colName in row)
        return row[colName];
    const keys = Object.keys(row);
    const foundKey = keys.find((k) => k === colName || k.endsWith(`_${colName}`) || k.endsWith(`.${colName}`));
    return foundKey ? row[foundKey] : undefined;
}
function buildRegexFromPattern(pattern) {
    const groups = [];
    let src = "^";
    let i = 0;
    while (i < pattern.length) {
        if (pattern[i] === "'") {
            let j = i + 1;
            let lit = "";
            while (j < pattern.length && pattern[j] !== "'")
                lit += pattern[j++];
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
        }
        else {
            src += pattern[i].replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
            i += 1;
        }
    }
    src += "$";
    return { regex: new RegExp(src, "i"), groups };
}
function parseDateWithPattern(value, pattern) {
    const s = (value ?? "").toString().trim();
    if (!s)
        return null;
    if (!pattern) {
        return (0, dateFormatting_1.parseDateLike)(s, { slashDateOrder: "DMY" });
    }
    const { regex, groups } = buildRegexFromPattern(pattern);
    const m = s.match(regex);
    if (!m)
        return null;
    let day;
    let month;
    let year;
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
    if (!year || !month || !day)
        return null;
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
function sampleValues(rows, columnName) {
    const out = [];
    const keys = rows.length ? Object.keys(rows[0]) : [];
    const key = columnName in (rows[0] ?? {})
        ? columnName
        : keys.find((k) => k === columnName ||
            k.endsWith(`_${columnName}`) ||
            k.endsWith(`.${columnName}`));
    if (!key)
        return out;
    for (const row of rows) {
        const v = row[key];
        if (v != null && v !== "")
            out.push(v);
        if (out.length >= SAMPLE_SIZE)
            break;
    }
    return out;
}
function inferSingleColumnType(values) {
    if (values.length === 0)
        return "string";
    let allBoolean = true;
    let allInteger = true;
    let allNumber = true;
    let dateLike = 0;
    for (const v of values) {
        const s = String(v).trim().toLowerCase();
        if (!BOOLEAN_TRUES.includes(s) &&
            !BOOLEAN_FALSES.includes(s) &&
            s !== "")
            allBoolean = false;
        const n = Number(String(v)
            .replace(/\s+/g, "")
            .replace(",", "."));
        if (isNaN(n) || s === "") {
            allNumber = false;
            allInteger = false;
        }
        else {
            if (n % 1 !== 0)
                allInteger = false;
        }
        const str = String(v).trim();
        if ((0, dateFormatting_1.parseDateLike)(v, { slashDateOrder: "DMY" }) || DATE_PATTERNS.some((p) => p.test(str)))
            dateLike++;
    }
    if (allBoolean && values.length > 0)
        return "boolean";
    if (dateLike >= Math.min(values.length * 0.8, values.length))
        return "date";
    if (allInteger && values.length > 0)
        return "integer";
    if (allNumber && values.length > 0)
        return "number";
    return "string";
}
function inferColumnTypes(rows, columnNames) {
    if (!rows.length)
        return [];
    const names = columnNames ?? Object.keys(rows[0]).filter((k) => k && typeof k === "string");
    const result = [];
    for (const col of names) {
        const values = sampleValues(rows, col);
        const inferredType = inferSingleColumnType(values);
        result.push({ column: col, inferredType });
    }
    return result;
}
function applyArithmeticOperations(rows, config) {
    if (!config?.operations?.length)
        return rows;
    if (rows.length > 0) {
    }
    const parseNum = (val) => {
        if (typeof val === "number")
            return val;
        if (val == null || val === "")
            return 0;
        const s = String(val).trim();
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
        const getValAndKey = (colName) => {
            if (colName in newRow)
                return { val: newRow[colName], key: colName };
            const foundKey = keys.find((k) => k === colName ||
                k.endsWith(`_${colName}`) ||
                k.endsWith(`.${colName}`));
            if (foundKey)
                return { val: newRow[foundKey], key: foundKey };
            return { val: undefined, key: null };
        };
        for (const op of config.operations) {
            let rawLeft;
            if (op.leftOperand.type === "column") {
                const res = getValAndKey(op.leftOperand.value);
                rawLeft = res.val;
            }
            else {
                rawLeft = op.leftOperand.value;
            }
            const leftVal = parseNum(rawLeft);
            let rawRight;
            if (op.rightOperand.type === "column") {
                const res = getValAndKey(op.rightOperand.value);
                rawRight = res.val;
            }
            else {
                rawRight = op.rightOperand.value;
            }
            const rightVal = parseNum(rawRight);
            let result;
            switch (op.operator) {
                case "+":
                    result = leftVal + rightVal;
                    break;
                case "-":
                    result = leftVal - rightVal;
                    break;
                case "*":
                    result = leftVal * rightVal;
                    break;
                case "/":
                    result = rightVal !== 0 ? leftVal / rightVal : 0;
                    break;
                case "%":
                    result = rightVal !== 0 ? leftVal % rightVal : 0;
                    break;
                case "^":
                    result = Math.pow(leftVal, rightVal);
                    break;
                default: result = 0;
            }
            newRow[op.resultColumn] = result;
        }
        return newRow;
    });
}
function isNullLike(value, patterns) {
    if (value == null)
        return true;
    const s = String(value).trim();
    if (s === "")
        return true;
    return patterns.some((p) => {
        const pTrim = String(p).trim();
        if (pTrim === "" && s === "")
            return true;
        return s === pTrim || s.toLowerCase() === pTrim.toLowerCase();
    });
}
function getKeyInRow(row, colName) {
    if (colName in row)
        return colName;
    const keys = Object.keys(row);
    const colLower = colName.toLowerCase();
    const exact = keys.find((k) => k.toLowerCase() === colLower);
    if (exact)
        return exact;
    const withPrefix = keys.find((k) => k.toLowerCase().endsWith("_" + colLower) || k === colName.replace(/\./g, "_"));
    return withPrefix;
}
function applyTransforms(row, config) {
    if (!config?.transforms?.length)
        return row;
    const next = { ...row };
    for (const t of config.transforms) {
        const keyInRow = getKeyInRow(next, t.column);
        if (keyInRow === undefined)
            continue;
        const v = next[keyInRow];
        switch (t.op) {
            case "trim":
                next[keyInRow] = typeof v === "string" ? v.trim() : v;
                break;
            case "upper":
                next[keyInRow] = typeof v === "string" ? v.toUpperCase() : v;
                break;
            case "lower":
                next[keyInRow] = typeof v === "string" ? v.toLowerCase() : v;
                break;
            case "replace":
                if (typeof v === "string" && "find" in t) {
                    try {
                        const regex = new RegExp(t.find, "g");
                        next[keyInRow] = v.replace(regex, t.replaceWith);
                    }
                    catch {
                        next[keyInRow] = v;
                    }
                }
                break;
            case "replace_value":
                if ("find" in t && "replaceWith" in t && String(v) === t.find) {
                    next[keyInRow] = t.replaceWith;
                }
                break;
            case "normalize_nulls": {
                const valueInRow = next[keyInRow];
                const patterns = "patterns" in t && Array.isArray(t.patterns) ? t.patterns : [];
                if (!isNullLike(valueInRow, patterns))
                    break;
                next[keyInRow] = t.action === "replace" && t.replacement !== undefined ? t.replacement : null;
                break;
            }
            case "normalize_spaces":
                if (typeof v === "string") {
                    next[keyInRow] = v.replace(/\s+/g, " ").trim();
                }
                break;
            case "strip_invisible":
                if (typeof v === "string") {
                    next[keyInRow] = v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
                }
                break;
            case "utf8_normalize":
                if (typeof v === "string") {
                    next[keyInRow] = v.normalize("NFC");
                }
                break;
            case "cast_number":
                next[keyInRow] =
                    v == null || v === "" || isNaN(Number(v)) ? null : Number(v);
                break;
            case "cast_date":
                {
                    const d = v ? new Date(v) : null;
                    next[keyInRow] = d && !isNaN(d.getTime()) ? d.toISOString() : null;
                }
                break;
        }
    }
    return next;
}
function applyDedupe(rows, keyColumns, keep) {
    if (!keyColumns?.length || rows.length === 0)
        return rows;
    const seen = new Map();
    const order = keep === "first" ? rows.map((_, i) => i) : rows.map((_, i) => rows.length - 1 - i);
    const toKeep = new Set();
    for (const i of order) {
        const row = rows[i];
        const key = keyColumns.map((col) => {
            const keyInRow = getKeyInRow(row, col);
            const val = keyInRow !== undefined ? row[keyInRow] : undefined;
            return val == null ? "__NULL__" : String(val);
        }).join("\x00");
        if (!seen.has(key)) {
            seen.set(key, i);
            toKeep.add(i);
        }
    }
    return rows.filter((_, i) => toKeep.has(i));
}
function applyCleanBatch(rows, config) {
    if (!config?.transforms?.length && !config?.dedupe?.keyColumns?.length)
        return rows;
    let out = rows.map((r) => applyTransforms(r, config));
    if (config?.dedupe?.keyColumns?.length) {
        out = applyDedupe(out, config.dedupe.keyColumns, config.dedupe.keep ?? "first");
    }
    return out;
}
function applyCastConversions(rows, config) {
    if (!config?.conversions?.length)
        return rows;
    return rows.map((row) => {
        const out = { ...row };
        const keys = Object.keys(out);
        const resolveTargets = (simple) => {
            const matches = keys.filter((k) => k === simple || k.endsWith(`_${simple}`));
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
                        const d = cv.inputFormat
                            ? parseDateWithPattern(String(v ?? ""), cv.inputFormat)
                            : (0, dateFormatting_1.parseDateLike)(v);
                        out[key] = d ? `${d.toISOString().slice(0, 10)}` : null;
                        break;
                    }
                    case "datetime": {
                        const d = cv.inputFormat
                            ? parseDateWithPattern(String(v ?? ""), cv.inputFormat)
                            : (0, dateFormatting_1.parseDateLike)(v);
                        out[key] = d ? d.toISOString() : null;
                        break;
                    }
                }
            }
        }
        return out;
    });
}
function evalCondition(rule, row) {
    const leftValRaw = rule.leftOperand?.type === "column"
        ? getValue(row, rule.leftOperand.value)
        : rule.leftOperand?.value;
    const rightValRaw = rule.rightOperand?.type === "column"
        ? getValue(row, rule.rightOperand.value)
        : rule.rightOperand?.value;
    const nLeft = Number(leftValRaw);
    const nRight = Number(rightValRaw);
    const isNum = !isNaN(nLeft) &&
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
function applyConditionRules(rows, config) {
    if (!config?.rules?.length)
        return rows;
    const useFirstMatch = config.resultColumn != null && config.resultColumn !== "";
    return rows.reduce((acc, row) => {
        const newRow = { ...row };
        let keepRow = true;
        if (useFirstMatch) {
            let assigned = false;
            for (const rule of config.rules) {
                if (evalCondition(rule, newRow)) {
                    const val = rule.outputType === "boolean"
                        ? true
                        : rule.thenValue ?? "";
                    newRow[config.resultColumn] = val;
                    assigned = true;
                    break;
                }
            }
            if (!assigned) {
                newRow[config.resultColumn] =
                    config.defaultResultValue ?? null;
            }
        }
        else {
            for (const rule of config.rules) {
                const conditionMet = evalCondition(rule, newRow);
                if (rule.shouldFilter && !conditionMet) {
                    keepRow = false;
                    break;
                }
                if (rule.outputType && rule.resultColumn) {
                    if (rule.outputType === "boolean") {
                        newRow[rule.resultColumn] = conditionMet;
                    }
                    else {
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
function applyCountAggregation(rows, config) {
    if (!config?.attribute)
        return rows;
    const attr = config.attribute;
    const resultColumn = config.resultColumn?.trim() || "conteo";
    const map = new Map();
    const originalValues = new Map();
    for (const r of rows) {
        const val = getValue(r, attr);
        const key = val == null ? "__NULL__" : String(val);
        map.set(key, (map.get(key) || 0) + 1);
        if (!originalValues.has(key))
            originalValues.set(key, val);
    }
    const out = [];
    for (const [key, cnt] of map.entries()) {
        out.push({ [attr]: originalValues.get(key), [resultColumn]: cnt });
    }
    out.sort((a, b) => {
        const d = (b[resultColumn] || 0) - (a[resultColumn] || 0);
        if (d !== 0)
            return d;
        const av = a[attr];
        const bv = b[attr];
        if (av == null && bv == null)
            return 0;
        if (av == null)
            return 1;
        if (bv == null)
            return -1;
        return String(av).localeCompare(String(bv));
    });
    return out;
}
//# sourceMappingURL=transformations.js.map