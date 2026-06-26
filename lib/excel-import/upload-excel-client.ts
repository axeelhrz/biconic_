import { safeJsonResponse } from "@/lib/safe-json-response";
import { shouldUseDirectS3Upload } from "@/lib/storage/s3-excel-storage";

async function uploadExcelMultipart(input: {
  file: File;
  connectionName: string;
  clientId: string;
}): Promise<{ connectionId: string; dataTableId: string }> {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("connectionName", input.connectionName);
  formData.append("clientId", input.clientId);

  const res = await fetch("/api/admin/connections/excel-upload", {
    method: "POST",
    body: formData,
  });

  const data = await safeJsonResponse<{
    ok?: boolean;
    connectionId?: string;
    dataTableId?: string;
    error?: string;
    stage?: string;
  }>(res);

  if (!res.ok || !data.connectionId || !data.dataTableId) {
    const err = new Error(data.error ?? "Error al subir el archivo") as Error & {
      stage?: string;
    };
    err.stage = data.stage ?? "upload_storage";
    throw err;
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
  const initRes = await fetch("/api/admin/connections/excel-upload/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connectionName: input.connectionName,
      clientId: input.clientId,
      fileName: input.file.name,
      fileSize: input.file.size,
    }),
  });

  const initData = await safeJsonResponse<{
    ok?: boolean;
    connectionId?: string;
    dataTableId?: string;
    uploadUrl?: string;
    error?: string;
    stage?: string;
  }>(initRes);

  if (!initRes.ok || !initData.connectionId || !initData.dataTableId || !initData.uploadUrl) {
    const err = new Error(initData.error ?? "Error al iniciar la subida") as Error & {
      stage?: string;
    };
    err.stage = initData.stage ?? "upload_storage";
    throw err;
  }

  const putRes = await fetch(initData.uploadUrl, {
    method: "PUT",
    body: input.file,
    headers: {
      "Content-Type": input.file.type || "application/octet-stream",
    },
  });

  if (!putRes.ok) {
    const err = new Error(
      `Error al subir el archivo al almacenamiento (${putRes.status})`
    ) as Error & { stage?: string };
    err.stage = "upload_storage";
    throw err;
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
