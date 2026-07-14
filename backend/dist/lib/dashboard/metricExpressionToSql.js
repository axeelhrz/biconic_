"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quotedColumn = quotedColumn;
exports.splitArgs = splitArgs;
exports.ifsYieldsOnlyTextLiterals = ifsYieldsOnlyTextLiterals;
exports.expressionYieldsText = expressionYieldsText;
exports.coerceAggFuncForTextOnlyIFS = coerceAggFuncForTextOnlyIFS;
exports.expressionToSql = expressionToSql;
exports.resolveFieldToSql = resolveFieldToSql;
function displayColumnToPhysical(name) {
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
function quotedColumn(name) {
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
function splitArgs(content) {
    const args = [];
    let depth = 0;
    let inQuote = null;
    let start = 0;
    for (let i = 0; i < content.length; i++) {
        const c = content[i];
        if (inQuote) {
            if (c === inQuote && content[i - 1] !== "\\")
                inQuote = null;
            continue;
        }
        if (c === "'" || c === '"') {
            inQuote = c;
            continue;
        }
        if (c === "(")
            depth++;
        else if (c === ")")
            depth--;
        else if ((c === "," || c === ";") && depth === 0) {
            args.push(content.slice(start, i).trim());
            start = i + 1;
        }
    }
    if (start <= content.length)
        args.push(content.slice(start).trim());
    return args.filter(Boolean);
}
function extractParenContent(s, start) {
    if (s[start] !== "(")
        return null;
    let depth = 1;
    let i = start + 1;
    for (; i < s.length; i++) {
        const c = s[i];
        if (c === "(")
            depth++;
        else if (c === ")") {
            depth--;
            if (depth === 0)
                return { inner: s.slice(start + 1, i).trim(), endIndex: i };
        }
    }
    return null;
}
function wrapBareCaseFragment(expanded) {
    const t = expanded.trim();
    if (!/\bCASE\s/i.test(t))
        return expanded;
    if (t[0] === "(") {
        const ex = extractParenContent(t, 0);
        if (ex && ex.endIndex === t.length - 1)
            return expanded;
    }
    return `(${t})`;
}
function isSpreadsheetQuotedString(arg) {
    const t = arg.trim();
    if (/^'[^']*'$/.test(t))
        return true;
    if (/^"[^"]*"$/.test(t))
        return true;
    return false;
}
function ifsYieldsOnlyTextLiterals(expression) {
    let s = (expression || "").replace(/\s+/g, " ").trim().replace(/;/g, ",");
    if (!s)
        return false;
    const ifsStart = s.search(/\bIFS\s*\(/i);
    if (ifsStart === -1 || ifsStart !== 0)
        return false;
    const open = s.indexOf("(", ifsStart);
    if (open === -1)
        return false;
    const extracted = extractParenContent(s, open);
    if (!extracted)
        return false;
    const tail = s.slice(extracted.endIndex + 1).trim();
    if (tail.length > 0)
        return false;
    const args = splitArgs(extracted.inner);
    if (args.length < 2)
        return false;
    let i = 0;
    while (i + 1 < args.length) {
        if (!isSpreadsheetQuotedString(args[i + 1]))
            return false;
        i += 2;
    }
    if (i < args.length && !isSpreadsheetQuotedString(args[i]))
        return false;
    return true;
}
const TEXT_YIELDING_FUNCS = [
    "CONCAT",
    "CONCATENATE",
    "UPPER",
    "LOWER",
    "TRIM",
    "LEFT",
    "RIGHT",
    "SUBSTRING",
    "MID",
    "TEXT",
    "PROPER",
    "REPLACE",
    "SUBSTITUTE",
    "REPT",
];
function isWholeFunctionCall(expression, fnNames) {
    const s = expression.replace(/\s+/g, " ").trim().replace(/;/g, ",");
    if (!s)
        return false;
    for (const fn of fnNames) {
        const re = new RegExp(`^\\s*${fn}\\s*\\(`, "i");
        if (!re.test(s))
            continue;
        const open = s.search(/\(/);
        const extracted = extractParenContent(s, open);
        if (extracted && s.slice(extracted.endIndex + 1).trim() === "")
            return true;
    }
    return false;
}
function ifYieldsOnlyTextLiterals(expression) {
    let s = (expression || "").replace(/\s+/g, " ").trim().replace(/;/g, ",");
    if (!s || /^\s*IFS\s*\(/i.test(s))
        return false;
    const ifStart = s.search(/\bIF\s*\(/i);
    if (ifStart === -1 || ifStart !== 0)
        return false;
    const open = s.indexOf("(", ifStart);
    const extracted = extractParenContent(s, open);
    if (!extracted)
        return false;
    if (s.slice(extracted.endIndex + 1).trim())
        return false;
    const args = splitArgs(extracted.inner);
    if (args.length !== 3)
        return false;
    return isSpreadsheetQuotedString(args[1]) && isSpreadsheetQuotedString(args[2]);
}
function expressionYieldsText(expression) {
    if (!expression?.trim())
        return false;
    if (ifsYieldsOnlyTextLiterals(expression))
        return true;
    if (ifYieldsOnlyTextLiterals(expression))
        return true;
    const s = expression.replace(/\s+/g, " ").trim().replace(/;/g, ",");
    if (/^('[^']*'|"[^"]*")$/.test(s))
        return true;
    if (isWholeFunctionCall(s, TEXT_YIELDING_FUNCS))
        return true;
    if (/^\s*IF\s*\(/i.test(s) && !/^\s*IFS\s*\(/i.test(s)) {
        const open = s.indexOf("(");
        const extracted = extractParenContent(s, open);
        if (extracted && s.slice(extracted.endIndex + 1).trim() === "") {
            const args = splitArgs(extracted.inner);
            if (args.length === 3 && expressionYieldsText(args[1]) && expressionYieldsText(args[2]))
                return true;
        }
    }
    return false;
}
function coerceAggFuncForTextOnlyIFS(func, expression) {
    const f = (func || "SUM").toString().toUpperCase().trim();
    if (!expression.trim())
        return f;
    if ((f === "SUM" || f === "AVG") && expressionYieldsText(expression))
        return "MAX";
    return f;
}
function expandIfToCaseWhen(expr) {
    const trimmed = expr.trim();
    const ifStart = trimmed.search(/\bIF\s*\(/i);
    if (ifStart === -1)
        return expr;
    const start = trimmed.indexOf("(", ifStart);
    if (start === -1)
        return expr;
    let depth = 1;
    let firstComma = -1;
    let secondComma = -1;
    let i = start + 1;
    for (; i < trimmed.length; i++) {
        const c = trimmed[i];
        if (c === "(")
            depth++;
        else if (c === ")") {
            depth--;
            if (depth === 0)
                break;
        }
        else if ((c === "," || c === ";") && depth === 1) {
            if (firstComma === -1)
                firstComma = i;
            else if (secondComma === -1)
                secondComma = i;
        }
    }
    if (firstComma === -1 || secondComma === -1)
        return expr;
    const cond = trimmed.slice(start + 1, firstComma).trim();
    const thenVal = trimmed.slice(firstComma + 1, secondComma).trim();
    const elseVal = trimmed.slice(secondComma + 1, i).trim();
    const caseExpr = `(CASE WHEN ${wrapBareCaseFragment(expandIfToCaseWhen(cond))} THEN ${wrapBareCaseFragment(expandIfToCaseWhen(thenVal))} ELSE ${wrapBareCaseFragment(expandIfToCaseWhen(elseVal))} END)`;
    return trimmed.slice(0, ifStart) + caseExpr + trimmed.slice(i + 1);
}
function expandIfsToCaseWhen(expr) {
    const trimmed = expr.trim();
    const ifsStart = trimmed.search(/\bIFS\s*\(/i);
    if (ifsStart === -1)
        return expr;
    const start = trimmed.indexOf("(", ifsStart);
    const extracted = extractParenContent(trimmed, start);
    if (!extracted)
        return expr;
    const args = splitArgs(extracted.inner);
    if (args.length < 2)
        return expr;
    const pairs = [];
    let i = 0;
    while (i + 1 < args.length) {
        pairs.push({ cond: args[i], val: args[i + 1] });
        i += 2;
    }
    const defaultVal = i < args.length ? args[i] : "NULL";
    const whenParts = pairs
        .map((p) => `WHEN ${wrapBareCaseFragment(expandIfsToCaseWhen(p.cond))} THEN ${wrapBareCaseFragment(expandIfsToCaseWhen(p.val))}`)
        .join(" ");
    const caseExpr = `(CASE ${whenParts} ELSE ${wrapBareCaseFragment(expandIfsToCaseWhen(defaultVal))} END)`;
    return trimmed.slice(0, ifsStart) + caseExpr + trimmed.slice(extracted.endIndex + 1);
}
function expandAndOr(expr, fn) {
    const regex = new RegExp(`\\b${fn}\\s*\\(`, "gi");
    const match = expr.match(regex);
    if (!match)
        return expr;
    const first = expr.search(regex);
    const start = expr.indexOf("(", first);
    const extracted = extractParenContent(expr, start);
    if (!extracted)
        return expr;
    const args = splitArgs(extracted.inner);
    const op = fn === "AND" ? " AND " : " OR ";
    const joined = args.map((a) => (fn === "AND" ? expandAndOr(a, "AND") : expandAndOr(a, "OR"))).join(op);
    const repl = `(${joined})`;
    return expr.slice(0, first) + repl + expr.slice(extracted.endIndex + 1);
}
function normalizeNumericComparisonLiterals(sql) {
    return sql.replace(/("[^"]+")\s*(<=|>=|<>|!=|=|<|>)\s*(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\b/g, (_m, col, op, num) => `${col}${op}'${num}'`);
}
function expressionToSql(expression, derivedLookup, _depth = 0) {
    if (!expression || typeof expression !== "string")
        return null;
    let s = expression.replace(/\s+/g, " ").trim();
    if (!s)
        return null;
    s = s.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"').replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'");
    const stringLiterals = [];
    s = s.replace(/'([^']*)'|"([^"]*)"/g, (_, single, double) => {
        const content = single !== undefined ? single : double;
        const idx = stringLiterals.length;
        stringLiterals.push(content.replace(/'/g, "''"));
        return `__STR${idx}__`;
    });
    const allowed = /^[a-zA-Z0-9_*+\-/().,\s'"%;^=<>!]+$/;
    if (!allowed.test(s))
        return null;
    s = s.replace(/;/g, ",");
    s = s.replace(/\bAVERAGE\s*\(/gi, "AVG(");
    s = s.replace(/\bLEN\s*\(/gi, "LENGTH(");
    s = s.replace(/\bMID\s*\(/gi, "SUBSTRING(");
    s = s.replace(/\bCONCATENATE\s*\(/gi, "CONCAT(");
    s = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*|\d+\.?\d*|__STR\d+__)\s+\^\s+([a-zA-Z_][a-zA-Z0-9_]*|\d+\.?\d*|__STR\d+__)\b/g, (_, a, b) => `POWER(${a},${b})`);
    while (/IF\s*\(/i.test(s) && !/IFS\s*\(/i.test(s)) {
        const next = expandIfToCaseWhen(s);
        if (next === s)
            break;
        s = next;
    }
    while (/\bIFS\s*\(/i.test(s)) {
        const next = expandIfsToCaseWhen(s);
        if (next === s)
            break;
        s = next;
    }
    while (/\bAND\s*\(/i.test(s)) {
        const next = expandAndOr(s, "AND");
        if (next === s)
            break;
        s = next;
    }
    while (/\bOR\s*\(/i.test(s)) {
        const next = expandAndOr(s, "OR");
        if (next === s)
            break;
        s = next;
    }
    while (/COUNTA\s*\(\s*UNIQUE\s*\(/i.test(s)) {
        const match = s.match(/COUNTA\s*\(\s*UNIQUE\s*\(/i);
        if (!match)
            break;
        const start = s.indexOf(match[0]);
        const openParen = s.indexOf("(", s.indexOf("UNIQUE", start));
        const extracted = extractParenContent(s, openParen);
        if (!extracted)
            break;
        const inner = extracted.inner;
        const countDistinctEnd = s.indexOf(")", extracted.endIndex + 1);
        if (countDistinctEnd === -1)
            break;
        const innerSql = expressionToSql(inner, derivedLookup, _depth + 1);
        if (!innerSql)
            break;
        const repl = `COUNT(DISTINCT ${innerSql})`;
        s = s.slice(0, start) + repl + s.slice(countDistinctEnd + 1);
    }
    s = s.replace(/\bCOUNTA\s*\(/gi, "COUNT(");
    const out = s.replace(/\b(primary\.[a-zA-Z_][a-zA-Z0-9_]*|join_\d+\.[a-zA-Z_][a-zA-Z0-9_]*|[a-zA-Z_][a-zA-Z0-9_]*)\b/g, (id) => {
        if (/^__STR\d+__$/.test(id))
            return id;
        if (/^\d+\.?\d*$/.test(id))
            return id;
        if (SQL_KNOWN_FUNCTIONS.has(id.toUpperCase()))
            return id.toUpperCase();
        if (derivedLookup && _depth < 5 && !/\./.test(id)) {
            const ref = derivedLookup[id.toLowerCase()];
            if (ref?.expression) {
                const inner = expressionToSql(ref.expression, derivedLookup, _depth + 1);
                if (inner)
                    return `(${inner})`;
            }
        }
        return quotedColumn(id);
    });
    const withStrings = out.replace(/__STR(\d+)__/g, (_, i) => {
        const content = stringLiterals[Number(i)] ?? "";
        return `'${content}'`;
    });
    return normalizeNumericComparisonLiterals(withStrings) || null;
}
function resolveFieldToSql(field, derivedLookup) {
    const trimmed = (field || "").trim();
    if (!trimmed)
        return null;
    const derived = derivedLookup?.[trimmed.toLowerCase()];
    if (derived?.expression) {
        return expressionToSql(derived.expression, derivedLookup);
    }
    return quotedColumn(trimmed);
}
//# sourceMappingURL=metricExpressionToSql.js.map