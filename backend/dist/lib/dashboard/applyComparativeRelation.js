"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildComparativeJoinKey = buildComparativeJoinKey;
exports.applyComparativeRelationToRows = applyComparativeRelationToRows;
exports.buildComparativeAggregateSql = buildComparativeAggregateSql;
const compareMetricRows_1 = require("./compareMetricRows");
const dateFormatting_1 = require("./dateFormatting");
const comparativeRelation_1 = require("../dataset/comparativeRelation");
function toNum(v) {
    if (v == null || v === "")
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function norm(s) {
    return s.replace(/\s+/g, "").toUpperCase();
}
function transformBaseKeyValue(raw, transform, parseOpts) {
    if (raw == null)
        return "";
    if (!transform || transform === "none")
        return String(raw).trim();
    const gran = transform;
    const d = (0, dateFormatting_1.parseDateLike)(raw, parseOpts);
    if (d) {
        const formatted = (0, dateFormatting_1.formatDateByGranularity)(d, gran, undefined, parseOpts);
        if (formatted != null)
            return formatted;
    }
    return String(raw).trim();
}
function buildComparativeJoinKey(row, mappings, side, parseOpts) {
    const parts = [];
    for (const m of mappings) {
        const col = side === "base" ? m.baseColumn : m.comparativeColumn;
        const raw = (0, compareMetricRows_1.getRowValue)(row, col);
        const val = side === "base"
            ? transformBaseKeyValue(raw, m.baseDateTransform, parseOpts)
            : String(raw ?? "").trim();
        parts.push(val);
    }
    return parts.join("\x01");
}
function applyComparativeRelationToRows(params) {
    const { baseRows, comparativeRows, relation, compareSpec, metricAliases, parseOpts } = params;
    const measureField = relation.comparativeFields.find((f) => f.column === compareSpec.comparativeField);
    const valueType = measureField?.valueType ?? "absolute";
    const compCol = compareSpec.comparativeField;
    const compMap = new Map();
    for (const row of comparativeRows) {
        const key = buildComparativeJoinKey(row, relation.fieldMappings, "comparative", parseOpts);
        const colKey = (0, compareMetricRows_1.resolveRowColumnKey)(row, compCol) ?? compCol;
        const val = toNum(row[colKey]);
        if (val == null)
            continue;
        if (valueType === "percent") {
            compMap.set(key, val);
        }
        else {
            const prev = compMap.get(key);
            compMap.set(key, prev != null ? prev + val : val);
        }
    }
    const targetAlias = metricAliases.find((a) => norm(a) === norm(compareSpec.metricAlias)) ?? compareSpec.metricAlias;
    const outputCols = (0, comparativeRelation_1.comparativeOutputColumns)(targetAlias, valueType);
    return baseRows.map((row) => {
        const out = { ...row };
        const joinKey = buildComparativeJoinKey(row, relation.fieldMappings, "base", parseOpts);
        const metricKey = (0, compareMetricRows_1.resolveRowColumnKey)(row, targetAlias) ?? targetAlias;
        const realVal = toNum(row[metricKey]);
        const compVal = compMap.get(joinKey) ?? null;
        if (valueType === "percent") {
            out[outputCols[0]] = realVal;
            out[outputCols[1]] = compVal;
            out[outputCols[2]] =
                realVal != null && compVal != null ? realVal - compVal : null;
        }
        else {
            out[outputCols[0]] = realVal;
            out[outputCols[1]] = compVal;
            const delta = realVal != null && compVal != null ? realVal - compVal : null;
            out[outputCols[2]] = delta;
            out[outputCols[3]] =
                delta != null && compVal != null && compVal !== 0 ? (delta / compVal) * 100 : null;
            out[outputCols[4]] =
                realVal != null && compVal != null && compVal !== 0 ? (realVal / compVal) * 100 : null;
        }
        return out;
    });
}
function buildComparativeAggregateSql(params) {
    const { schema, tableName, relation, comparativeField, valueType } = params;
    const safeSchema = schema.replace(/"/g, '""');
    const safeTable = tableName.replace(/"/g, '""');
    const table = `"${safeSchema}"."${safeTable}"`;
    const groupParts = [];
    relation.fieldMappings.forEach((m) => {
        const col = `"${m.comparativeColumn.replace(/"/g, '""')}"`;
        groupParts.push(col);
    });
    const measureCol = `"${comparativeField.replace(/"/g, '""')}"`;
    const aggFunc = valueType === "percent" ? "AVG" : "SUM";
    const safeAlias = comparativeField.replace(/"/g, '""');
    const selectGroup = groupParts
        .map((g, i) => `${g}::text AS "${relation.fieldMappings[i].comparativeColumn.replace(/"/g, '""')}"`)
        .join(", ");
    return `
    SELECT ${selectGroup}, ${aggFunc}(${measureCol}::numeric) AS "${safeAlias}"
    FROM ${table}
    GROUP BY ${groupParts.join(", ")}
  `;
}
//# sourceMappingURL=applyComparativeRelation.js.map