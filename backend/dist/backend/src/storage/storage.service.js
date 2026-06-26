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
exports.StorageService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const etl_constants_1 = require("../etl/etl.constants");
let StorageService = class StorageService {
    constructor(excelQueue) {
        this.excelQueue = excelQueue;
        const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
        this.bucket = process.env.S3_BUCKET ?? "excel-uploads";
        this.s3 = new client_s3_1.S3Client({
            region: process.env.S3_REGION ?? "us-east-1",
            endpoint,
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
            credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY ?? "biconic",
                secretAccessKey: process.env.S3_SECRET_KEY ?? "biconic_minio_password",
            },
        });
    }
    async getUploadUrl(key, _contentType) {
        const command = new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        const url = await (0, s3_request_presigner_1.getSignedUrl)(this.s3, command, { expiresIn: 3600 });
        return { url, key, bucket: this.bucket };
    }
    async getDownloadUrl(key) {
        const command = new client_s3_1.GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        const url = await (0, s3_request_presigner_1.getSignedUrl)(this.s3, command, { expiresIn: 3600 });
        return { url, key };
    }
    async enqueueExcelProcessing(payload) {
        const job = await this.excelQueue.add("import", payload, {
            removeOnComplete: 50,
            removeOnFail: 20,
        });
        return { jobId: job.id, status: "queued" };
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(etl_constants_1.EXCEL_QUEUE)),
    __metadata("design:paramtypes", [bullmq_2.Queue])
], StorageService);
//# sourceMappingURL=storage.service.js.map