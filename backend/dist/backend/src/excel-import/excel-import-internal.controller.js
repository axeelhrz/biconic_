"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExcelImportInternalController = void 0;
const common_1 = require("@nestjs/common");
const process_data_import_1 = require("../../../lib/excel-import/process-data-import");
let ExcelImportInternalController = class ExcelImportInternalController {
    async runImport(body, internalSecret) {
        const expected = process.env.INTERNAL_PROCESS_EXCEL_SECRET?.trim();
        if (expected && internalSecret !== expected) {
            throw new common_1.UnauthorizedException("No autorizado");
        }
        if (!body?.connectionId || !body?.dataTableId) {
            throw new common_1.UnauthorizedException("Faltan connectionId o dataTableId");
        }
        const parseMode = body.parseMode === "strict" ||
            body.parseMode === "tolerant" ||
            body.parseMode === "mixed"
            ? body.parseMode
            : "mixed";
        const selectedSheet = typeof body.selectedSheet === "string" && body.selectedSheet.trim() !== ""
            ? body.selectedSheet.trim()
            : null;
        void (0, process_data_import_1.runProcessExcelImport)({
            connectionId: body.connectionId,
            dataTableId: body.dataTableId,
            parseMode,
            selectedSheet,
            continuation: Boolean(body.continuation),
            forceReimport: Boolean(body.forceReimport),
        }).catch(async (err) => {
            console.error("[excel-import/run-import]", err);
            try {
                const { createImportAdminClient } = await Promise.resolve().then(() => __importStar(require("@/lib/excel-import/import-admin-client")));
                const admin = createImportAdminClient();
                await admin
                    .from("data_tables")
                    .update({
                    import_status: "failed",
                    error_message: err instanceof Error ? err.message : String(err),
                })
                    .eq("id", body.dataTableId);
            }
            catch (_) { }
        });
        return { ok: true, status: "started" };
    }
};
exports.ExcelImportInternalController = ExcelImportInternalController;
__decorate([
    (0, common_1.Post)("run-import"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)("x-internal-process-excel")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ExcelImportInternalController.prototype, "runImport", null);
exports.ExcelImportInternalController = ExcelImportInternalController = __decorate([
    (0, common_1.Controller)("internal/excel")
], ExcelImportInternalController);
//# sourceMappingURL=excel-import-internal.controller.js.map