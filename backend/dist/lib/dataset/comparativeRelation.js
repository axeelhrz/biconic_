"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDateTransform = isDateTransform;
exports.deriveComparisonLevel = deriveComparisonLevel;
exports.detectComparativeValueType = detectComparativeValueType;
exports.isComparativeMeasureCandidate = isComparativeMeasureCandidate;
exports.granularityRank = granularityRank;
exports.isAnalysisFinerThanComparisonLevel = isAnalysisFinerThanComparisonLevel;
exports.comparativeOutputColumns = comparativeOutputColumns;
exports.parseComparativeFieldMapping = parseComparativeFieldMapping;
exports.parseComparativeMeasureField = parseComparativeMeasureField;
exports.parseComparativeRelation = parseComparativeRelation;
exports.parseComparativeRelationsFromConfig = parseComparativeRelationsFromConfig;
exports.findComparativeRelation = findComparativeRelation;
exports.sqlDateTruncExpr = sqlDateTruncExpr;
exports.quoteSqlIdentifier = quoteSqlIdentifier;
const derive_column_types_1 = require("../derive-column-types");
const DATE_TRANSFORMS = ["none", "day", "week", "month", "quarter", "year"];
const GRANULARITY_RANK = {
    none: 0,
    day: 1,
    week: 2,
    month: 3,
    quarter: 4,
    semester: 4,
    year: 5,
};
function isDateTransform(v) {
    return typeof v === "string" && DATE_TRANSFORMS.includes(v);
}
function deriveComparisonLevel(mappings) {
    return mappings.map((m) => m.baseColumn.trim()).filter(Boolean);
}
function detectComparativeValueType(columnName, sampleValues) {
    const format = (0, derive_column_types_1.inferFormatForColumn)(columnName, "Número", sampleValues ?? []);
    if (format === "percent")
        return "percent";
    return "absolute";
}
function isComparativeMeasureCandidate(params) {
    const { columnName, role, inferredType, format } = params;
    if (role === "measure")
        return true;
    if (inferredType === "Número" || inferredType === "number") {
        if (format === "percent" || format === "currency" || format === "number" || !format)
            return true;
    }
    const detected = (0, derive_column_types_1.inferFormatForColumn)(columnName, "Número", []);
    return detected === "percent" || detected === "currency" || detected === "number";
}
function granularityRank(value) {
    if (!value || value === "none")
        return 0;
    return GRANULARITY_RANK[value] ?? 0;
}
function isAnalysisFinerThanComparisonLevel(params) {
    const { analysisDimensions, analysisDateGranularity, comparisonLevel, fieldMappings, timeColumn } = params;
    for (const mapping of fieldMappings) {
        const transform = mapping.baseDateTransform ?? "none";
        if (transform === "none")
            continue;
        const baseCol = mapping.baseColumn.trim();
        const isTimeDim = (timeColumn && baseCol === timeColumn) ||
            analysisDimensions.some((d) => d.trim() === baseCol);
        if (!isTimeDim)
            continue;
        if (analysisDateGranularity && granularityRank(analysisDateGranularity) < granularityRank(transform)) {
            return true;
        }
    }
    const compSet = new Set(comparisonLevel.map((c) => c.trim().toLowerCase()));
    for (const dim of analysisDimensions) {
        const d = dim.trim();
        if (!d)
            continue;
        const inLevel = compSet.has(d.toLowerCase());
        if (!inLevel && comparisonLevel.length > 0) {
        }
    }
    return false;
}
function comparativeOutputColumns(metricAlias, valueType) {
    const safe = metricAlias.trim() || "metric";
    if (valueType === "percent") {
        return [
            `${safe}_valor_real_porcentaje`,
            `${safe}_valor_comparativo_porcentaje`,
            `${safe}_diferencia_puntos_porcentuales`,
        ];
    }
    return [
        `${safe}_valor_real`,
        `${safe}_valor_comparativo`,
        `${safe}_delta`,
        `${safe}_delta_porcentaje`,
        `${safe}_cumplimiento`,
    ];
}
function parseComparativeFieldMapping(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const o = raw;
    const comparativeColumn = typeof o.comparativeColumn === "string" ? o.comparativeColumn.trim() : "";
    const baseColumn = typeof o.baseColumn === "string" ? o.baseColumn.trim() : "";
    if (!comparativeColumn || !baseColumn)
        return null;
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `map-${Date.now()}`;
    const baseDateTransform = isDateTransform(o.baseDateTransform) ? o.baseDateTransform : undefined;
    return { id, comparativeColumn, baseColumn, ...(baseDateTransform ? { baseDateTransform } : {}) };
}
function parseComparativeMeasureField(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const o = raw;
    const column = typeof o.column === "string" ? o.column.trim() : "";
    if (!column)
        return null;
    const valueType = o.valueType === "percent" ? "percent" : "absolute";
    const label = typeof o.label === "string" ? o.label.trim() : undefined;
    return { column, valueType, ...(label ? { label } : {}) };
}
function parseComparativeRelation(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const o = raw;
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : "";
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const comparativeDatasetId = typeof o.comparativeDatasetId === "string" ? o.comparativeDatasetId.trim() : "";
    if (!id || !name || !comparativeDatasetId)
        return null;
    const fieldMappings = Array.isArray(o.fieldMappings)
        ? o.fieldMappings.map(parseComparativeFieldMapping).filter((m) => m != null)
        : [];
    const comparativeFields = Array.isArray(o.comparativeFields)
        ? o.comparativeFields.map(parseComparativeMeasureField).filter((f) => f != null)
        : [];
    const comparisonLevel = Array.isArray(o.comparisonLevel)
        ? o.comparisonLevel.filter((x) => typeof x === "string" && x.trim() !== "")
        : deriveComparisonLevel(fieldMappings);
    const comparativeDatasetName = typeof o.comparativeDatasetName === "string" ? o.comparativeDatasetName.trim() : undefined;
    let validation;
    if (o.validation && typeof o.validation === "object") {
        const v = o.validation;
        const status = v.status === "blocked" || v.status === "warning" || v.status === "ok" ? v.status : "ok";
        validation = {
            status,
            validatedAt: typeof v.validatedAt === "string" ? v.validatedAt : new Date().toISOString(),
            ...(v.duplicates && typeof v.duplicates === "object"
                ? {
                    duplicates: {
                        count: Number(v.duplicates.count ?? 0),
                        sampleKeys: Array.isArray(v.duplicates.sampleKeys)
                            ? v.duplicates.sampleKeys.filter((k) => typeof k === "string")
                            : undefined,
                    },
                }
                : {}),
            ...(v.baseWithoutMatch && typeof v.baseWithoutMatch === "object"
                ? { baseWithoutMatch: { count: Number(v.baseWithoutMatch.count ?? 0) } }
                : {}),
            ...(v.comparativeWithoutBase && typeof v.comparativeWithoutBase === "object"
                ? {
                    comparativeWithoutBase: {
                        count: Number(v.comparativeWithoutBase.count ?? 0),
                    },
                }
                : {}),
        };
    }
    return {
        id,
        name,
        comparativeDatasetId,
        ...(comparativeDatasetName ? { comparativeDatasetName } : {}),
        fieldMappings,
        comparisonLevel,
        comparativeFields,
        ...(validation ? { validation } : {}),
    };
}
function parseComparativeRelationsFromConfig(config) {
    if (!config || typeof config !== "object")
        return [];
    const raw = config.comparativeRelations;
    if (!Array.isArray(raw))
        return [];
    return raw.map(parseComparativeRelation).filter((r) => r != null);
}
function findComparativeRelation(config, relationId) {
    const relations = parseComparativeRelationsFromConfig(config);
    return relations.find((r) => r.id === relationId) ?? null;
}
function sqlDateTruncExpr(columnSql, transform) {
    if (transform === "none")
        return columnSql;
    if (transform === "quarter") {
        return `DATE_TRUNC('quarter', ${columnSql}::timestamp)`;
    }
    return `DATE_TRUNC('${transform}', ${columnSql}::timestamp)`;
}
function quoteSqlIdentifier(name) {
    return `"${String(name).replace(/"/g, '""')}"`;
}
//# sourceMappingURL=comparativeRelation.js.map