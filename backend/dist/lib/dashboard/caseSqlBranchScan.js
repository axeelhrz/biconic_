"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.skipWsSql = skipWsSql;
exports.matchSqlKeywordAt = matchSqlKeywordAt;
exports.findThenBranchBoundary = findThenBranchBoundary;
exports.findElseBranchClosingEnd = findElseBranchClosingEnd;
function skipWsSql(s, i) {
    let j = i;
    while (j < s.length && /\s/.test(s[j]))
        j++;
    return j;
}
function matchSqlKeywordAt(s, i, kw) {
    if (i + kw.length > s.length)
        return false;
    if (s.slice(i, i + kw.length).toUpperCase() !== kw)
        return false;
    const before = i > 0 ? s[i - 1] : " ";
    const after = s[i + kw.length];
    if (/[A-Za-z0-9_]/.test(before))
        return false;
    if (after && /[A-Za-z0-9_]/.test(after))
        return false;
    return true;
}
function findThenBranchBoundary(t, afterThen) {
    let i = afterThen;
    let depth = 0;
    let inQuote = null;
    let nestedCase = 0;
    while (i < t.length) {
        const c = t[i];
        if (inQuote) {
            if (c === inQuote && t[i - 1] !== "\\")
                inQuote = null;
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
        if (nestedCase === 0 && matchSqlKeywordAt(t, j, "WHEN"))
            return j;
        if (nestedCase === 0 && matchSqlKeywordAt(t, j, "ELSE"))
            return j;
        i++;
    }
    return -1;
}
function findElseBranchClosingEnd(t, afterElse) {
    let i = afterElse;
    let depth = 0;
    let inQuote = null;
    let nestedCase = 0;
    while (i < t.length) {
        const c = t[i];
        if (inQuote) {
            if (c === inQuote && t[i - 1] !== "\\")
                inQuote = null;
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
//# sourceMappingURL=caseSqlBranchScan.js.map