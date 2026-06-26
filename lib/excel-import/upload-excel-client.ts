import { safeJsonResponse } from "@/lib/safe-json-response";
import { shouldUseDirectS3Upload } from "@/lib/storage/s3-excel-storage";

function uploadError(message: string, stage = "upload_storage"): Error & { stage: string } {
  const err = new Error(message) as Error & { stage: string };
  err.stage = stage;
  return err;
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
  }>(res);

  if (!res.ok || !data.connectionId || !data.dataTableId) {
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
      `No se pudo iniciar la subida: ${err instanceof Error ? err.message : "error de red"}. Verificá que estés logueado y que el deploy incluya /excel-upload/init.`
    );
  }

  const initData = await safeJsonResponse<{
    ok?: boolean;
    connectionId?: string;
    dataTableId?: string;
    uploadUrl?: string;
    error?: string;
    stage?: string;
  }>(initRes);

  if (!initRes.ok || !initData.connectionId || !initData.dataTableId || !initData.uploadUrl) {
    throw uploadError(
      initData.error ?? "Error al iniciar la subida",
      initData.stage ?? "upload_storage"
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
  if (shouldUseDirectS3Upload(input.file.size)) {
    return uploadExcelViaPresignedUrl(input);
  }
  return uploadExcelMultipart(input);
}
