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
exports.EtlInternalController = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const service_1 = require("../../../lib/supabase/service");
const execute_etl_pipeline_1 = require("../../../lib/etl/execute-etl-pipeline");
const etl_run_context_1 = require("../../../lib/etl/etl-run-context");
let EtlInternalController = class EtlInternalController {
    async runPipeline(body, internalSecret) {
        const expected = process.env.INTERNAL_ETL_SECRET?.trim() ??
            process.env.CRON_SECRET?.trim();
        if (expected && internalSecret !== expected) {
            throw new common_1.UnauthorizedException("No autorizado");
        }
        const runId = body.runId ? String(body.runId) : (0, uuid_1.v4)();
        const supabaseAdmin = (0, service_1.createServiceRoleClient)();
        let user = body.userId
            ? { id: String(body.userId) }
            : null;
        if (!user && body.etlId) {
            const { data: etlRow } = await supabaseAdmin
                .from("etl")
                .select("user_id")
                .eq("id", body.etlId)
                .single();
            if (etlRow?.user_id)
                user = { id: etlRow.user_id };
        }
        if (!user) {
            throw new common_1.UnauthorizedException("Usuario no identificado para el ETL");
        }
        if (body.etlId) {
            await (0, execute_etl_pipeline_1.markStaleRunsForEtl)(supabaseAdmin, body.etlId).catch(() => { });
        }
        await supabaseAdmin
            .from("etl_runs_log")
            .update({ status: "running" })
            .eq("id", runId);
        const ctx = (0, etl_run_context_1.createEtlPipelineContext)();
        const waitForCompletion = body.waitForCompletion !== false;
        if (!waitForCompletion) {
            void (0, execute_etl_pipeline_1.executeEtlPipeline)(body, runId, supabaseAdmin, user, ctx).catch((err) => {
                console.error("[internal/etl/run-pipeline] background error:", err);
            });
            return { ok: true, runId, status: "started" };
        }
        const rowsProcessed = await (0, execute_etl_pipeline_1.executeEtlPipeline)(body, runId, supabaseAdmin, user, ctx);
        return { ok: true, runId, completed: true, rowsProcessed };
    }
};
exports.EtlInternalController = EtlInternalController;
__decorate([
    (0, common_1.Post)("run-pipeline"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)("x-internal-etl")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], EtlInternalController.prototype, "runPipeline", null);
exports.EtlInternalController = EtlInternalController = __decorate([
    (0, common_1.Controller)("internal/etl")
], EtlInternalController);
//# sourceMappingURL=etl-internal.controller.js.map