"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSqlLiteral = toSqlLiteral;
function toSqlLiteral(v) {
    if (v == null || typeof v === "undefined")
        return "NULL";
    if (typeof v === "number" && Number.isFinite(v))
        return `'${String(v)}'`;
    if (typeof v === "boolean")
        return v ? "TRUE" : "FALSE";
    const s = String(v).replace(/'/g, "''");
    return `'${s}'`;
}
//# sourceMappingURL=toSqlLiteral.js.map