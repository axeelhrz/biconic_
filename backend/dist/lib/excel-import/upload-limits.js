"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXCEL_UPLOAD_MAX_BYTES = exports.EXCEL_UPLOAD_MAX_MB = void 0;
const DEFAULT_MAX_MB = 300;
function resolveMaxMb() {
    const raw = process.env.EXCEL_UPLOAD_MAX_MB?.trim();
    if (!raw)
        return DEFAULT_MAX_MB;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return DEFAULT_MAX_MB;
    return Math.floor(parsed);
}
exports.EXCEL_UPLOAD_MAX_MB = resolveMaxMb();
exports.EXCEL_UPLOAD_MAX_BYTES = exports.EXCEL_UPLOAD_MAX_MB * 1024 * 1024;
//# sourceMappingURL=upload-limits.js.map