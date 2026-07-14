import fs from "fs";
import path from "path";

const UPLOAD_ROOT = path.join(process.cwd(), "data", "excel-uploads");

export function ensureExcelUploadDir(): string {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  return UPLOAD_ROOT;
}

export function buildExcelStoragePath(userId: string, fileExt: string): string {
  const safeExt = fileExt.replace(/[^a-z0-9]/gi, "") || "xlsx";
  return `${userId}/${Date.now()}.${safeExt}`;
}

export function getLocalExcelAbsolutePath(storagePath: string): string {
  const normalized = storagePath.replace(/^\/+/, "");
  const abs = path.resolve(UPLOAD_ROOT, normalized);
  if (!abs.startsWith(path.resolve(UPLOAD_ROOT))) {
    throw new Error("Ruta de archivo no válida");
  }
  return abs;
}

export function hasLocalExcelFile(storagePath: string): boolean {
  try {
    return fs.existsSync(getLocalExcelAbsolutePath(storagePath));
  } catch {
    return false;
  }
}

export async function saveExcelFileLocal(
  storagePath: string,
  bytes: Buffer
): Promise<string> {
  ensureExcelUploadDir();
  const abs = getLocalExcelAbsolutePath(storagePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, bytes);
  return storagePath;
}

export function getExcelFileServeUrl(storagePath: string, origin?: string): string {
  const base =
    origin?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  return `${base}/api/admin/excel-file?path=${encodeURIComponent(storagePath)}`;
}
