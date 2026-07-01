"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERCEL_SAFE_UPLOAD_BYTES = void 0;
exports.getS3BucketName = getS3BucketName;
exports.isS3Configured = isS3Configured;
exports.isVercelRuntime = isVercelRuntime;
exports.shouldUseDirectS3Upload = shouldUseDirectS3Upload;
exports.getPresignedUploadUrl = getPresignedUploadUrl;
exports.getPresignedDownloadUrl = getPresignedDownloadUrl;
exports.getS3ObjectContentLength = getS3ObjectContentLength;
exports.getS3ObjectReadableStream = getS3ObjectReadableStream;
exports.fetchExcelBytesFromStorage = fetchExcelBytesFromStorage;
exports.excelContentType = excelContentType;
const backend_config_1 = require("../api/backend-config");
const stream_1 = require("stream");
let cachedS3Client = null;
function getLocalS3Client() {
    if (!cachedS3Client) {
        const { S3Client } = require("@aws-sdk/client-s3");
        cachedS3Client = new S3Client({
            region: process.env.S3_REGION ?? "us-east-1",
            endpoint: process.env.S3_ENDPOINT,
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
            credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY ?? "",
                secretAccessKey: process.env.S3_SECRET_KEY ?? "",
            },
        });
    }
    return cachedS3Client;
}
function getS3BucketName() {
    return process.env.S3_BUCKET ?? "excel-uploads";
}
function isS3Configured() {
    return Boolean(process.env.S3_ENDPOINT?.trim() &&
        process.env.S3_ACCESS_KEY?.trim() &&
        process.env.S3_SECRET_KEY?.trim());
}
function isVercelRuntime() {
    return Boolean(process.env.VERCEL);
}
exports.VERCEL_SAFE_UPLOAD_BYTES = 4 * 1024 * 1024;
function shouldUseDirectS3Upload(fileSize) {
    return isVercelRuntime() || fileSize > exports.VERCEL_SAFE_UPLOAD_BYTES;
}
async function backendStoragePost(path, body, cookieHeader) {
    const res = await fetch(`${(0, backend_config_1.getBackendApiUrl)()}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
        },
        body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({})));
    if (!res.ok) {
        throw new Error(data.message ??
            data.error ??
            `Error del storage backend (${res.status})`);
    }
    return data;
}
async function getPresignedUploadUrl(key, contentType, cookieHeader) {
    return backendStoragePost("/storage/upload-url", { key, contentType }, cookieHeader);
}
async function getPresignedDownloadUrl(key, options) {
    const internal = options?.internal === true;
    const headers = {
        "Content-Type": "application/json",
    };
    if (options?.cookieHeader) {
        headers.cookie = options.cookieHeader;
    }
    if (internal) {
        const secret = process.env.INTERNAL_PROCESS_EXCEL_SECRET?.trim() ??
            process.env.CRON_SECRET?.trim() ??
            "";
        if (!secret) {
            throw new Error("Falta INTERNAL_PROCESS_EXCEL_SECRET para descargar archivos en continuaciones internas.");
        }
        headers["x-internal-storage"] = secret;
    }
    const path = internal ? "/storage/internal/download-url" : "/storage/download-url";
    const res = await fetch(`${(0, backend_config_1.getBackendApiUrl)()}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ key }),
    });
    const data = (await res.json().catch(() => ({})));
    if (!res.ok) {
        throw new Error(data.message ?? data.error ?? `Error del storage backend (${res.status})`);
    }
    if (!data.url)
        throw new Error("No se pudo obtener URL de descarga");
    return data.url;
}
async function getS3ObjectContentLength(key) {
    if (!isS3Configured())
        return null;
    const { HeadObjectCommand } = require("@aws-sdk/client-s3");
    const response = await getLocalS3Client().send(new HeadObjectCommand({
        Bucket: getS3BucketName(),
        Key: key,
    }));
    const len = Number(response.ContentLength ?? 0);
    return Number.isFinite(len) && len > 0 ? len : null;
}
async function getS3ObjectReadableStream(key) {
    if (!isS3Configured()) {
        throw new Error("S3 no configurado para lectura directa");
    }
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    const response = await getLocalS3Client().send(new GetObjectCommand({
        Bucket: getS3BucketName(),
        Key: key,
    }));
    const body = response.Body;
    if (!body) {
        throw new Error("Objeto vacío en almacenamiento S3");
    }
    if (body instanceof stream_1.Readable) {
        return body;
    }
    return stream_1.Readable.from(body);
}
async function fetchExcelBytesFromStorage(storagePath, options) {
    const url = await getPresignedDownloadUrl(storagePath, options);
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`No se pudo descargar el archivo (${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
}
function excelContentType(fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
        case "csv":
            return "text/csv";
        case "xls":
            return "application/vnd.ms-excel";
        case "xlsm":
            return "application/vnd.ms-excel.sheet.macroEnabled.12";
        case "ods":
            return "application/vnd.oasis.opendocument.spreadsheet";
        case "xlsx":
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        default:
            return "application/octet-stream";
    }
}
//# sourceMappingURL=s3-excel-storage.js.map