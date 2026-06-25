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
exports.EtlController = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const etl_service_1 = require("./etl.service");
const database_service_1 = require("../database/database.service");
let EtlController = class EtlController {
    constructor(etl, db) {
        this.etl = etl;
        this.db = db;
    }
    list(req) {
        return this.etl.listEtlsForUser(req.user.sub, req.user.app_role ?? "CREATOR");
    }
    async run(body, req) {
        return this.etl.enqueueRun({
            etlId: body.etlId,
            userId: req.user.sub,
            body,
        });
    }
    getRun(runId) {
        return this.etl.getRunStatus(runId);
    }
    runEvents(runId) {
        return (0, rxjs_1.interval)(2000).pipe((0, rxjs_1.switchMap)(async () => {
            const row = await this.etl.getRunStatus(runId);
            return row;
        }), (0, rxjs_1.takeWhile)((row) => row?.status === "started" || row?.status === "running", true), (0, rxjs_1.map)((row) => ({ data: row })));
    }
    markStale(auth) {
        const secret = auth?.replace(/^Bearer\s+/i, "") ?? "";
        return this.etl.markStaleRunsFailed();
    }
    runScheduled(auth) {
        const secret = auth?.replace(/^Bearer\s+/i, "") ?? "";
        return this.etl.runScheduled(secret);
    }
};
exports.EtlController = EtlController;
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EtlController.prototype, "list", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)("run"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], EtlController.prototype, "run", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)("runs/:runId"),
    __param(0, (0, common_1.Param)("runId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EtlController.prototype, "getRun", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Sse)("runs/:runId/events"),
    __param(0, (0, common_1.Param)("runId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", rxjs_1.Observable)
], EtlController.prototype, "runEvents", null);
__decorate([
    (0, common_1.Post)("mark-stale-runs-failed"),
    __param(0, (0, common_1.Headers)("authorization")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EtlController.prototype, "markStale", null);
__decorate([
    (0, common_1.Post)("run-scheduled"),
    __param(0, (0, common_1.Headers)("authorization")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EtlController.prototype, "runScheduled", null);
exports.EtlController = EtlController = __decorate([
    (0, common_1.Controller)("etl"),
    __metadata("design:paramtypes", [etl_service_1.EtlService,
        database_service_1.DatabaseService])
], EtlController);
//# sourceMappingURL=etl.controller.js.map