"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWeakSchemaDataType = isWeakSchemaDataType;
exports.inferTypeFromSchemaDataType = inferTypeFromSchemaDataType;
exports.mergeColumnInferredType = mergeColumnInferredType;
exports.inferFormatForColumn = inferFormatForColumn;
exports.inferColumnMetadata = inferColumnMetadata;
exports.mergeColumnInferredFormat = mergeColumnInferredFormat;
exports.deriveColumnTypesFromSample = deriveColumnTypesFromSample;
exports.deriveColumnMetadataFromSample = deriveColumnMetadataFromSample;
const dateFormatting_1 = require("./dashboard/dateFormatting");
const IDENTIFIER_NAME_RE = /(?:^|_)(codigo|código|cod|sku|cuit|cuil|cbu|dni|legajo|barcode|ean|gtin|isbn|partida|comprobante|tipocomprobante|nrodoc|numdoc)(?:_|$)/i;
const DATE_DIMENSION_NAME_RE = /(?:^|_)(mes|month|anio|año|year|periodo|fecha|dia|day)(?:_|$)/i;
const CURRENCY_NAME_RE = /(?:^|_)(precio|precio_unitario|preciounitario|importe|monto|subtotal|costo|coste|valor|amount|price|tarifa|saldo|neto|bruto|facturado|pagado|pago|cobrado|debe|haber|unitario|unitprice|venta|compra|recaudacion|ingreso|egreso|descuento|recargo|impuesto|iva|iibb|exento|gravado|remito|total_linea|total_neto|total_bruto|importe_neto|importe_bruto|precio_venta|precio_compra|gran_total|monto_total|importe_total)(?:_|$)/i;
const PERCENT_NAME_RE = /(?:^|_)(porcentaje|porc|pct|percent|tasa|alicuota|alícuota|descuento_pct)(?:_|$)/i;
const QUANTITY_NAME_RE = /(?:^|_)(cantidad|cant|qty|quantity|unidades|unidad|stock|bultos|piezas|items|item_count|num_items)(?:_|$)/i;
const INTEGER_COUNT_NAME_RE = /(?:^|_)(count|conteo|numero|nro|num|secuencia|renglon|linea|line)(?:_|$)/i;
function isWeakSchemaDataType(dataType) {
    if (!dataType)
        return true;
    const d = String(dataType).toLowerCase();
    return (d.includes("varchar") ||
        d.includes("character") ||
        d.includes("char") ||
        d === "text" ||
        d.includes("clob") ||
        d.includes("string") ||
        d.includes("blob"));
}
function inferTypeFromSchemaDataType(dataType) {
    if (!dataType || isWeakSchemaDataType(dataType))
        return null;
    const d = String(dataType).toLowerCase();
    if (["date", "timestamp", "timestamptz", "datetime", "time"].some((t) => d.includes(t)))
        return "Fecha";
    if (["int", "integer", "bigint", "smallint", "numeric", "decimal", "float", "double", "real", "number"].some((t) => d.includes(t))) {
        return "Número";
    }
    return "Texto";
}
function mergeColumnInferredType(params) {
    const fromSchema = inferTypeFromSchemaDataType(params.schemaDataType);
    if (fromSchema)
        return fromSchema;
    if (params.sampleInferred)
        return params.sampleInferred;
    return inferTypeFromSchemaDataType(params.schemaDataType) ?? "Texto";
}
function bareColumnName(field) {
    return field
        .replace(/^primary[._]/i, "")
        .replace(/^join_\d+[._]/i, "")
        .trim();
}
function looksLikeIdentifierField(field) {
    const bare = bareColumnName(field);
    if (!bare)
        return false;
    return IDENTIFIER_NAME_RE.test(bare);
}
function looksLikeDateDimensionField(field) {
    const bare = bareColumnName(field);
    if (!bare)
        return false;
    return DATE_DIMENSION_NAME_RE.test(bare);
}
function looksLikeCurrencyField(field) {
    const bare = bareColumnName(field);
    if (!bare)
        return false;
    if (/^total$/i.test(bare))
        return true;
    return CURRENCY_NAME_RE.test(bare);
}
function looksLikePercentField(field) {
    const bare = bareColumnName(field);
    if (!bare)
        return false;
    return PERCENT_NAME_RE.test(bare);
}
function looksLikeQuantityField(field) {
    const bare = bareColumnName(field);
    if (!bare)
        return false;
    return QUANTITY_NAME_RE.test(bare);
}
function looksLikeIntegerCountField(field) {
    const bare = bareColumnName(field);
    if (!bare)
        return false;
    return INTEGER_COUNT_NAME_RE.test(bare);
}
function inferFormatForColumn(columnName, type, sampleValues = []) {
    if (type === "Fecha")
        return "DD/MM/YYYY";
    if (type === "Texto")
        return "";
    if (looksLikePercentField(columnName))
        return "percent";
    if (looksLikeQuantityField(columnName) || looksLikeIntegerCountField(columnName))
        return "number";
    if (looksLikeCurrencyField(columnName))
        return "currency";
    let nonNull = 0;
    let currencyHint = 0;
    let percentHint = 0;
    let hasDecimals = 0;
    for (const v of sampleValues) {
        if (v === null || v === undefined || String(v).trim() === "")
            continue;
        nonNull++;
        const s = String(v).trim();
        if (/[$€£]/.test(s))
            currencyHint++;
        if (/%/.test(s))
            percentHint++;
        const n = parseLocalizedNumber(v);
        if (n != null && !Number.isInteger(n))
            hasDecimals++;
    }
    if (nonNull > 0) {
        if (percentHint / nonNull >= 0.25)
            return "percent";
        if (currencyHint / nonNull >= 0.25)
            return "currency";
        if (hasDecimals / nonNull >= 0.5 && !looksLikeIntegerCountField(columnName))
            return "currency";
    }
    return "number";
}
function inferColumnMetadata(params) {
    const type = mergeColumnInferredType({
        columnName: params.columnName,
        schemaDataType: params.schemaDataType,
        sampleInferred: params.sampleInferred,
    });
    if (type === "Texto" && looksLikeCurrencyField(params.columnName)) {
        const values = params.sampleValues ?? [];
        const numericRatio = values.filter((v) => v != null && String(v).trim() !== "").length > 0
            ? values.filter((v) => v != null && String(v).trim() !== "" && isNumericLike(v)).length /
                values.filter((v) => v != null && String(v).trim() !== "").length
            : 0;
        if (numericRatio >= 0.5) {
            return { type: "Número", format: "currency" };
        }
    }
    if (type === "Texto" && looksLikePercentField(params.columnName)) {
        const values = params.sampleValues ?? [];
        const numericRatio = values.filter((v) => v != null && String(v).trim() !== "").length > 0
            ? values.filter((v) => v != null && String(v).trim() !== "" && isNumericLike(v)).length /
                values.filter((v) => v != null && String(v).trim() !== "").length
            : 0;
        if (numericRatio >= 0.5) {
            return { type: "Número", format: "percent" };
        }
    }
    return {
        type,
        format: inferFormatForColumn(params.columnName, type, params.sampleValues ?? []),
    };
}
function mergeColumnInferredFormat(params) {
    if (params.userFormat?.trim())
        return params.userFormat.trim();
    if (params.sampleFormat?.trim())
        return params.sampleFormat;
    return inferFormatForColumn(params.columnName, params.type);
}
function isIdentifierLikeString(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return false;
    if (/[A-Za-z]/.test(trimmed))
        return true;
    if (/^0\d+$/.test(trimmed))
        return true;
    if (/^\d{11,}$/.test(trimmed))
        return true;
    return false;
}
function parseLocalizedNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    if (!trimmed || isIdentifierLikeString(trimmed))
        return null;
    let normalized = trimmed.replace(/\s+/g, "").replace(/[%$€£]/g, "");
    const hasDot = normalized.includes(".");
    const hasComma = normalized.includes(",");
    if (hasDot && hasComma) {
        const lastDot = normalized.lastIndexOf(".");
        const lastComma = normalized.lastIndexOf(",");
        normalized =
            lastComma > lastDot
                ? normalized.replace(/\./g, "").replace(",", ".")
                : normalized.replace(/,/g, "");
    }
    else if (hasComma) {
        const parts = normalized.split(",");
        normalized = parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2
            ? normalized.replace(",", ".")
            : normalized.replace(/,/g, "");
    }
    if (!/^-?\d+(\.\d+)?$/.test(normalized))
        return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
}
function isNumericLike(v) {
    return parseLocalizedNumber(v) != null;
}
function isPlausibleExcelSerial(n) {
    return Number.isFinite(n) && n >= 7305 && n <= 60000;
}
function isDateLike(v) {
    if (v == null)
        return false;
    if (typeof v === "number" && Number.isFinite(v)) {
        if (v > 1e12 || (v > 1e9 && v < 1e10))
            return (0, dateFormatting_1.parseDateLike)(v, { slashDateOrder: "DMY" }) != null;
        if (Number.isInteger(v) && Math.abs(v) < 1000)
            return false;
        if (isPlausibleExcelSerial(v))
            return (0, dateFormatting_1.parseDateLike)(v, { slashDateOrder: "DMY" }) != null;
        return false;
    }
    if (typeof v === "string") {
        const raw = v.trim();
        if (/^\d{1,3}$/.test(raw))
            return false;
        if (/^\d+(\.\d+)?$/.test(raw)) {
            const n = Number(raw);
            if (Number.isInteger(n) && n < 1000)
                return false;
            if (!isPlausibleExcelSerial(n) && n < 1e9)
                return false;
        }
    }
    return (0, dateFormatting_1.parseDateLike)(v, { slashDateOrder: "DMY" }) != null;
}
function isMonthLike(v) {
    const n = parseLocalizedNumber(v);
    return n != null && Number.isInteger(n) && n >= 1 && n <= 12;
}
function isYearLike(v) {
    const n = parseLocalizedNumber(v);
    return n != null && Number.isInteger(n) && n >= 1900 && n <= 2100;
}
function getRowVal(row, field) {
    if (row[field] !== undefined && row[field] !== null)
        return row[field];
    const lower = field.toLowerCase();
    const key = Object.keys(row).find((k) => k.toLowerCase() === lower);
    return key !== undefined ? row[key] : undefined;
}
function inferTypeFromCounts(field, nonNull, sampleSize, dateCount, numericCount, monthLikeCount, yearLikeCount) {
    if (nonNull === 0)
        return "Texto";
    if (looksLikeIdentifierField(field))
        return "Texto";
    const dateRatio = dateCount / nonNull;
    const numericRatio = numericCount / nonNull;
    if (dateRatio >= 0.85)
        return "Fecha";
    if (numericRatio >= 0.85) {
        if (looksLikeDateDimensionField(field) &&
            numericCount > 0 &&
            (monthLikeCount / numericCount >= 0.9 || yearLikeCount / numericCount >= 0.9)) {
            return "Fecha";
        }
        return "Número";
    }
    if (nonNull / sampleSize >= 0.4 && dateRatio >= 0.6)
        return "Fecha";
    if (nonNull / sampleSize >= 0.4 && numericRatio >= 0.6) {
        if (looksLikeDateDimensionField(field) &&
            numericCount > 0 &&
            (monthLikeCount / numericCount >= 0.9 || yearLikeCount / numericCount >= 0.9)) {
            return "Fecha";
        }
        return "Número";
    }
    return "Texto";
}
function deriveColumnTypesFromSample(sampleData) {
    const result = {};
    if (sampleData.length === 0)
        return result;
    const sampleRow = sampleData[0];
    if (!sampleRow || typeof sampleRow !== "object")
        return result;
    const keySet = new Set(Object.keys(sampleRow));
    for (const row of sampleData.slice(1)) {
        if (row && typeof row === "object")
            Object.keys(row).forEach((k) => keySet.add(k));
    }
    const availableFields = Array.from(keySet);
    for (const field of availableFields) {
        let nonNull = 0;
        let dateCount = 0;
        let numericCount = 0;
        let monthLikeCount = 0;
        let yearLikeCount = 0;
        for (const row of sampleData) {
            const r = row;
            if (!r || typeof r !== "object")
                continue;
            const val = getRowVal(r, field);
            if (val === null || val === undefined)
                continue;
            nonNull++;
            if (isDateLike(val))
                dateCount++;
            else if (isNumericLike(val)) {
                numericCount++;
                if (isMonthLike(val))
                    monthLikeCount++;
                if (isYearLike(val))
                    yearLikeCount++;
            }
        }
        result[field] = inferTypeFromCounts(field, nonNull, sampleData.length, dateCount, numericCount, monthLikeCount, yearLikeCount);
    }
    return result;
}
function sampleValuesForField(sampleData, field) {
    const out = [];
    for (const row of sampleData) {
        const r = row;
        if (!r || typeof r !== "object")
            continue;
        const val = getRowVal(r, field);
        if (val !== null && val !== undefined)
            out.push(val);
    }
    return out;
}
function deriveColumnMetadataFromSample(sampleData) {
    const types = deriveColumnTypesFromSample(sampleData);
    const result = {};
    for (const [field, type] of Object.entries(types)) {
        const values = sampleValuesForField(sampleData, field);
        result[field] = inferColumnMetadata({
            columnName: field,
            sampleInferred: type,
            sampleValues: values,
        });
    }
    return result;
}
//# sourceMappingURL=derive-column-types.js.map