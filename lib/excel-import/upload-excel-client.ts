import { safeJsonResponse } from "@/lib/safe-json-response";

export async function uploadExcelViaOwnBackend(input: {
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
