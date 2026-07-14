"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureExcelUploadDir = ensureExcelUploadDir;
exports.buildExcelStoragePath = buildExcelStoragePath;
exports.getLocalExcelAbsolutePath = getLocalExcelAbsolutePath;
exports.hasLocalExcelFile = hasLocalExcelFile;
exports.saveExcelFileLocal = saveExcelFileLocal;
exports.getExcelFileServeUrl = getExcelFileServeUrl;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const UPLOAD_ROOT = path_1.default.join(process.cwd(), "data", "excel-uploads");
function ensureExcelUploadDir() {
    fs_1.default.mkdirSync(UPLOAD_ROOT, { recursive: true });
    return UPLOAD_ROOT;
}
function buildExcelStoragePath(userId, fileExt) {
    const safeExt = fileExt.replace(/[^a-z0-9]/gi, "") || "xlsx";
    return `${userId}/${Date.now()}.${safeExt}`;
}
function getLocalExcelAbsolutePath(storagePath) {
    const normalized = storagePath.replace(/^\/+/, "");
    const abs = path_1.default.resolve(UPLOAD_ROOT, normalized);
    if (!abs.startsWith(path_1.default.resolve(UPLOAD_ROOT))) {
        throw new Error("Ruta de archivo no válida");
    }
    return abs;
}
function hasLocalExcelFile(storagePath) {
    try {
        return fs_1.default.existsSync(getLocalExcelAbsolutePath(storagePath));
    }
    catch {
        return false;
    }
}
async function saveExcelFileLocal(storagePath, bytes) {
    ensureExcelUploadDir();
    const abs = getLocalExcelAbsolutePath(storagePath);
    fs_1.default.mkdirSync(path_1.default.dirname(abs), { recursive: true });
    await fs_1.default.promises.writeFile(abs, bytes);
    return storagePath;
}
function getExcelFileServeUrl(storagePath, origin) {
    const base = origin?.replace(/\/$/, "") ??
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
        "http://localhost:3000";
    return `${base}/api/admin/excel-file?path=${encodeURIComponent(storagePath)}`;
}
//# sourceMappingURL=excel-upload-storage.js.map