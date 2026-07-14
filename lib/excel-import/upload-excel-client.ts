import { safeJsonResponse } from "@/lib/safe-json-response";
import { getPublicBackendApiUrl } from "@/lib/api/backend-config";
import {
  shouldUseDirectS3Upload,
  VERCEL_SAFE_UPLOAD_BYTES,
} from "@/lib/storage/s3-excel-storage";

/** En el navegador `process.env.VERCEL` no existe; detectar despliegue remoto. */
function shouldClientUseDirectS3Upload(fileSize: number): boolean {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      return true;
    }
    if (process.env.NEXT_PUBLIC_FORCE_DIRECT_EXCEL_UPLOAD === "1") {
      return true;
    }
    return fileSize > VERCEL_SAFE_UPLOAD_BYTES;
  }
  return shouldUseDirectS3Upload(fileSize);
}

type UploadError = Error & { stage: string; useDirectUpload?: boolean };

function uploadError(
  message: string,
  stage = "upload_storage",
  options?: { useDirectUpload?: boolean }
): UploadError {
  const err = new Error(message) as UploadError;
  err.stage = stage;
  if (options?.useDirectUpload) {
    err.useDirectUpload = true;
  }
  return err;
}

function postFormWithUploadToken(
  url: string,
  uploadToken: string,
  file: File,
  fields: Record<string, string>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    for (const [key, value] of Object.entries(fields)) {
      formData.append(key, value);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("X-Upload-Token", uploadToken);
    xhr.timeout = 45 * 60 * 1000;

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let detail = xhr.responseText?.slice(0, 200) || xhr.statusText;
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        detail = parsed.message ?? parsed.error ?? detail;
      } catch {
        /* ignore */
      }
      reject(
        uploadError(
          `El servidor rechazó la subida (HTTP ${xhr.status}): ${detail}`
        )
      );
    };

    xhr.onerror = () => {
      reject(
        uploadError(
          "No se pudo conectar con el servidor de archivos. Verificá CORS_ORIGIN en Railway (debe incluir el dominio de la app, p. ej. https://biconic-platform.vercel.app)."
        )
      );
    };

    xhr.ontimeout = () => {
      reject(uploadError("Tiempo de espera agotado al subir el archivo (más de 45 min)."));
    };

    xhr.onabort = () => {
      reject(uploadError("Subida cancelada."));
    };

    xhr.send(formData);
  });
}

function putFileToPresignedUrl(url: string, file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.timeout = 45 * 60 * 1000;

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(
        uploadError(
          `El almacenamiento rechazó la subida (HTTP ${xhr.status}). Revisá credenciales S3 en Railway.`
        )
      );
    };

    xhr.onerror = () => {
      reject(
        uploadError(
          "No se pudo conectar con Cloudflare R2. Revisá la política CORS del bucket excel-uploads (AllowedOrigins, PUT, AllowedHeaders: *)."
        )
      );
    };

    xhr.ontimeout = () => {
      reject(uploadError("Tiempo de espera agotado al subir el archivo (más de 45 min)."));
    };

    xhr.onabort = () => {
      reject(uploadError("Subida cancelada."));
    };

    xhr.send(file);
  });
}

async function uploadExcelMultipart(input: {
  file: File;
  connectionName: string;
  clientId: string;
}): Promise<{ connectionId: string; dataTableId: string }> {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("connectionName", input.connectionName);
  formData.append("clientId", input.clientId);

  let res: Response;
  try {
    res = await fetch("/api/admin/connections/excel-upload", {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    throw uploadError(
      err instanceof Error ? err.message : "Error de red al subir el archivo"
    );
  }

  const data = await safeJsonResponse<{
    ok?: boolean;
    connectionId?: string;
    dataTableId?: string;
    error?: string;
    stage?: string;
    useDirectUpload?: boolean;
  }>(res);

  if (!res.ok || !data.connectionId || !data.dataTableId) {
    if (res.status === 413 && data.useDirectUpload) {
      throw uploadError("DIRECT_UPLOAD_REQUIRED", data.stage ?? "upload_storage", {
        useDirectUpload: true,
      });
    }
    throw uploadError(data.error ?? "Error al subir el archivo", data.stage ?? "upload_storage");
  }

  return {
    connectionId: data.connectionId,
    dataTableId: data.dataTableId,
  };
}

async function uploadExcelViaPresignedUrl(input: {
  file: File;
  connectionName: string;
  clientId: string;
}): Promise<{ connectionId: string; dataTableId: string }> {
  let initRes: Response;
  try {
    initRes = await fetch("/api/admin/connections/excel-upload/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        connectionName: input.connectionName,
        clientId: input.clientId,
        fileName: input.file.name,
        fileSize: input.file.size,
      }),
    });
  } catch (err) {
    throw uploadError(
      `No se pudo iniciar la subida: ${err instanceof Error ? err.message : "error de red"}. Verificá que estés logueado.`
    );
  }

  const initData = await safeJsonResponse<{
    ok?: boolean;
    connectionId?: string;
    dataTableId?: string;
    storagePath?: string;
    uploadToken?: string;
    directUploadUrl?: string;
    uploadUrl?: string | null;
    error?: string;
    stage?: string;
  }>(initRes);

  if (!initRes.ok || !initData.connectionId || !initData.dataTableId) {
    throw uploadError(
      initData.error ?? "Error al iniciar la subida",
      initData.stage ?? "upload_storage"
    );
  }

  const storagePath = initData.storagePath ?? "";
  const directUrl =
    initData.directUploadUrl ??
    `${getPublicBackendApiUrl()}/storage/excel/direct-upload`;

  if (initData.uploadToken && storagePath) {
    try {
      await postFormWithUploadToken(directUrl, initData.uploadToken, input.file, {
        storagePath,
        connectionId: initData.connectionId,
      });
      return {
        connectionId: initData.connectionId,
        dataTableId: initData.dataTableId,
      };
    } catch (directErr) {
      if (!initData.uploadUrl) throw directErr;
      console.warn("[excel-upload] direct upload failed, trying R2 presigned:", directErr);
    }
  }

  if (!initData.uploadUrl) {
    throw uploadError(
      "No se pudo subir el archivo por el servidor ni por almacenamiento directo."
    );
  }

  try {
    await putFileToPresignedUrl(initData.uploadUrl, input.file);
  } catch (err) {
    if (err instanceof Error && "stage" in err) throw err;
    throw uploadError(err instanceof Error ? err.message : "Error al subir a R2");
  }

  return {
    connectionId: initData.connectionId,
    dataTableId: initData.dataTableId,
  };
}

export async function uploadExcelViaOwnBackend(input: {
  file: File;
  connectionName: string;
  clientId: string;
}): Promise<{ connectionId: string; dataTableId: string }> {
  if (shouldClientUseDirectS3Upload(input.file.size)) {
    return uploadExcelViaPresignedUrl(input);
  }
  try {
    return await uploadExcelMultipart(input);
  } catch (err) {
    const needsDirect =
      err instanceof Error &&
      "useDirectUpload" in err &&
      (err as UploadError).useDirectUpload === true;
    if (needsDirect) {
      return uploadExcelViaPresignedUrl(input);
    }
    throw err;
  }
}
