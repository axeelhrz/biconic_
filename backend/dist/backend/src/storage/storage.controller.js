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
const platform_express_1 = require("@nestjs/platform-express");
const jwt_1 = require("@nestjs/jwt");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const storage_service_1 = require("./storage.service");
const upload_limits_1 = require("../../../lib/excel-import/upload-limits");
let StorageController = class StorageController {
    constructor(storage, jwt) {
        this.storage = storage;
        this.jwt = jwt;
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
    async directUpload(file, storagePath, connectionId, uploadToken) {
        if (!uploadToken?.trim()) {
            throw new common_1.UnauthorizedException("Falta token de subida");
        }
        if (!file?.buffer?.length) {
            throw new common_1.BadRequestException("Archivo requerido");
        }
        if (!storagePath?.trim() || !connectionId?.trim()) {
            throw new common_1.BadRequestException("storagePath y connectionId son requeridos");
        }
        let payload;
        try {
            payload = await this.jwt.verifyAsync(uploadToken);
        }
        catch {
            throw new common_1.UnauthorizedException("Token de subida inválido o expirado");
        }
        if (payload.purpose !== "excel-upload") {
            throw new common_1.UnauthorizedException("Token de subida inválido");
        }
        if (String(payload.key ?? "") !== storagePath.trim()) {
            throw new common_1.UnauthorizedException("Token no coincide con la ruta de almacenamiento");
        }
        if (String(payload.connectionId ?? "") !== connectionId.trim()) {
            throw new common_1.UnauthorizedException("Token no coincide con la conexión");
        }
        const expectedSize = Number(payload.fileSize ?? 0);
        const receivedSize = file.buffer.length;
        if (expectedSize > 0 && receivedSize !== expectedSize) {
            throw new common_1.BadRequestException(`Upload incompleto: se recibieron ${receivedSize} bytes y se esperaban ${expectedSize}.`);
        }
        await this.storage.putObject(storagePath.trim(), file.buffer, file.mimetype);
        const storedSize = await this.storage.getObjectContentLength(storagePath.trim());
        if (expectedSize > 0 && storedSize != null && storedSize !== expectedSize) {
            throw new common_1.BadRequestException(`El archivo en almacenamiento no coincide con el tamaño esperado (${storedSize} vs ${expectedSize} bytes).`);
        }
        return { ok: true, key: storagePath.trim(), bytesUploaded: receivedSize };
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
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "uploadUrl", null);
__decorate([
    (0, common_1.Post)("download-url"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
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
    (0, common_1.Post)("excel/direct-upload"),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)("file", { limits: { fileSize: upload_limits_1.EXCEL_UPLOAD_MAX_BYTES } })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Body)("storagePath")),
    __param(2, (0, common_1.Body)("connectionId")),
    __param(3, (0, common_1.Headers)("x-upload-token")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], StorageController.prototype, "directUpload", null);
__decorate([
    (0, common_1.Post)("excel/process"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], StorageController.prototype, "processExcel", null);
exports.StorageController = StorageController = __decorate([
    (0, common_1.Controller)("storage"),
    __metadata("design:paramtypes", [storage_service_1.StorageService,
        jwt_1.JwtService])
], StorageController);
//# sourceMappingURL=storage.controller.js.map