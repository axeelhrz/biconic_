import { getBackendApiUrl } from "@/lib/api/backend-config";
import { Readable } from "stream";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedS3Client: any = null;

function getLocalS3Client() {
  if (!cachedS3Client) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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

export function getS3BucketName(): string {
  return process.env.S3_BUCKET ?? "excel-uploads";
}

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

/** Tamaño del objeto en bytes (HeadObject). */
export async function getS3ObjectContentLength(key: string): Promise<number | null> {
  if (!isS3Configured()) return null;
  const { HeadObjectCommand } = require("@aws-sdk/client-s3");
  const response = await getLocalS3Client().send(
    new HeadObjectCommand({
      Bucket: getS3BucketName(),
      Key: key,
    })
  );
  const len = Number(response.ContentLength ?? 0);
  return Number.isFinite(len) && len > 0 ? len : null;
}

/** Lectura directa desde S3/R2 (evita fetch a URL presignada; usar en Railway/workers). */
export async function getS3ObjectReadableStream(key: string): Promise<Readable> {
  if (!isS3Configured()) {
    throw new Error("S3 no configurado para lectura directa");
  }
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  const response = await getLocalS3Client().send(
    new GetObjectCommand({
      Bucket: getS3BucketName(),
      Key: key,
    })
  );
  const body = response.Body;
  if (!body) {
    throw new Error("Objeto vacío en almacenamiento S3");
  }
  if (body instanceof Readable) {
    return body;
  }
  return Readable.from(body as AsyncIterable<Uint8Array>);
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
