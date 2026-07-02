"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JoinQueryInternalController = void 0;
const common_1 = require("@nestjs/common");
const call_join_query_for_etl_1 = require("../../../lib/connection/call-join-query-for-etl");
const etl_run_context_1 = require("../../../lib/etl/etl-run-context");
let JoinQueryInternalController = class JoinQueryInternalController {
    async joinQuery(body, internalSecret) {
        const expected = process.env.INTERNAL_ETL_SECRET?.trim() ??
            process.env.CRON_SECRET?.trim();
        if (expected && internalSecret !== expected) {
            throw new common_1.UnauthorizedException("No autorizado");
        }
        const ctx = (0, etl_run_context_1.createEtlPipelineContext)({
            internalEtlSecret: internalSecret ?? expected ?? "",
        });
        try {
            const result = await (0, call_join_query_for_etl_1.callJoinQueryForEtl)(body, ctx);
            if (!result.ok) {
                return { ok: false, error: result.error || "JOIN falló" };
            }
            return result;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                ok: false,
                error: `JOIN no disponible (${message}). Configurá NEXT_INTERNAL_URL con la URL de Vercel.`,
            };
        }
    }
};
exports.JoinQueryInternalController = JoinQueryInternalController;
__decorate([
    (0, common_1.Post)("join-query"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)("x-internal-etl")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], JoinQueryInternalController.prototype, "joinQuery", null);
exports.JoinQueryInternalController = JoinQueryInternalController = __decorate([
    (0, common_1.Controller)("internal/connection")
], JoinQueryInternalController);
//# sourceMappingURL=join-query-internal.controller.js.map