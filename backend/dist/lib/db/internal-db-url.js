"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXCEL_PHYSICAL_SCHEMA = void 0;
exports.getInternalDbUrl = getInternalDbUrl;
function getInternalDbUrl() {
    return (process.env.DATABASE_URL ??
        "postgres://biconic:biconic_dev_password@localhost:6432/biconic");
}
exports.EXCEL_PHYSICAL_SCHEMA = "data_warehouse";
//# sourceMappingURL=internal-db-url.js.map