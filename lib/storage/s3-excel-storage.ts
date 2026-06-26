import { getBackendApiUrl } from "@/lib/api/backend-config";

export function isS3Configured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT?.trim() &&
      process.env.S3_ACCESS_KEY?.trim() &&
      process.env.S3_SECRET_KEY?.trim()
  );
}

export function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}

/** Umbral seguro bajo el límite de body de funciones serverless en Vercel (~4.5 MB). */
export const VERCEL_SAFE_UPLOAD_BYTES = 4 * 1024 * 1024;

export function shouldUseDirectS3Upload(fileSize: number): boolean {
  return isVercelRuntime() || fileSize > VERCEL_SAFE_UPLOAD_BYTES;
}

async function backendStoragePost<T>(
  path: string,
  body: Record<string, unknown>,
  cookieHeader?: string | null
): Promise<T> {
  const res = await fetch(`${getBackendApiUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message ??
        (data as { error?: string }).error ??
        `Error del storage backend (${res.status})`
    );
  }
  return data;
}

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  cookieHeader?: string | null
): Promise<{ url: string; key: string }> {
  return backendStoragePost("/storage/upload-url", { key, contentType }, cookieHeader);
}

export async function getPresignedDownloadUrl(
  key: string,
  options?: { cookieHeader?: string | null; internal?: boolean }
): Promise<string> {
  const internal = options?.internal === true;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options?.cookieHeader) {
    headers.cookie = options.cookieHeader;
  }
  if (internal) {
    const secret =
      process.env.INTERNAL_PROCESS_EXCEL_SECRET?.trim() ??
      process.env.CRON_SECRET?.trim() ??
      "";
    if (!secret) {
      throw new Error(
        "Falta INTERNAL_PROCESS_EXCEL_SECRET para descargar archivos en continuaciones internas."
      );
    }
    headers["x-internal-storage"] = secret;
  }

  const path = internal ? "/storage/internal/download-url" : "/storage/download-url";
  const res = await fetch(`${getBackendApiUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ key }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? `Error del storage backend (${res.status})`);
  }
  if (!data.url) throw new Error("No se pudo obtener URL de descarga");
  return data.url;
}

export async function fetchExcelBytesFromStorage(
  storagePath: string,
  options?: { cookieHeader?: string | null; internal?: boolean }
): Promise<Buffer> {
  const url = await getPresignedDownloadUrl(storagePath, options);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo descargar el archivo (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export function excelContentType(fileName: string): string {
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
