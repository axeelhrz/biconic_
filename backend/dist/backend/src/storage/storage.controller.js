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
exports.StorageController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const storage_service_1 = require("./storage.service");
let StorageController = class StorageController {
    constructor(storage) {
        this.storage = storage;
    }
    uploadUrl(body) {
        return this.storage.getUploadUrl(body.key, body.contentType);
    }
    downloadUrl(body) {
        return this.storage.getDownloadUrl(body.key);
    }
    internalDownloadUrl(body, req) {
        const secret = process.env.INTERNAL_PROCESS_EXCEL_SECRET?.trim() ??
            process.env.CRON_SECRET?.trim() ??
            "";
        const header = req.headers["x-internal-storage"];
        const provided = Array.isArray(header) ? header[0] : header;
        if (!secret || provided !== secret) {
            throw new common_1.UnauthorizedException();
        }
        return this.storage.getDownloadUrl(body.key);
    }
    processExcel(body, req) {
        return this.storage.enqueueExcelProcessing({
            connectionId: body.connectionId,
            objectKey: body.objectKey,
            userId: req.user.sub,
        });
    }
};
exports.StorageController = StorageController;
__decorate([
    (0, common_1.Post)("upload-url"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "uploadUrl", null);
__decorate([
    (0, common_1.Post)("download-url"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "downloadUrl", null);
__decorate([
    (0, common_1.Post)("internal/download-url"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "internalDownloadUrl", null);
__decorate([
    (0, common_1.Post)("excel/process"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "processExcel", null);
exports.StorageController = StorageController = __decorate([
    (0, common_1.Controller)("storage"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [storage_service_1.StorageService])
], StorageController);
//# sourceMappingURL=storage.controller.js.map