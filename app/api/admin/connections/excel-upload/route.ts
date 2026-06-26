import { NextResponse } from "next/server";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import {
  createExcelConnectionWithFile,
  requireAuthUserId,
} from "@/lib/excel-import/create-excel-connection";
import {
  EXCEL_UPLOAD_MAX_BYTES,
  EXCEL_UPLOAD_MAX_MB,
} from "@/lib/excel-import/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!shouldUseOwnBackend()) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  try {
    const userId = await requireAuthUserId();
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        {
          error:
            `No se pudo leer el archivo. Si es muy grande, reiniciá el servidor de desarrollo tras actualizar next.config. Máx. ${EXCEL_UPLOAD_MAX_MB}MB.`,
          stage: "upload_storage",
        },
        { status: 413 }
      );
    }
    const file = formData.get("file");
    const connectionName = String(formData.get("connectionName") ?? "").trim();
    const clientId = String(formData.get("clientId") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    }
    if (!connectionName) {
      return NextResponse.json({ error: "Nombre de conexión requerido" }, { status: 400 });
    }
    if (!clientId) {
      return NextResponse.json({ error: "Cliente requerido" }, { status: 400 });
    }
    if (file.size > EXCEL_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { error: `Archivo demasiado grande (máx. ${EXCEL_UPLOAD_MAX_MB}MB)` },
        { status: 413 }
      );
    }

    const { shouldUseDirectS3Upload } = await import("@/lib/storage/s3-excel-storage");
    if (shouldUseDirectS3Upload(file.size)) {
      return NextResponse.json(
        {
          error:
            "Este archivo es demasiado grande para subir por el servidor. El cliente debe usar subida directa a almacenamiento.",
          stage: "upload_storage",
          useDirectUpload: true,
        },
        { status: 413 }
      );
    }

    const allowed = ["xlsx", "xls", "xlsm", "csv", "ods"];
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !allowed.includes(ext)) {
      return NextResponse.json(
        { error: "Formato no soportado. Usá .xlsx, .xls, .xlsm, .csv u .ods." },
        { status: 400 }
      );
    }

    const result = await createExcelConnectionWithFile({
      file,
      connectionName,
      clientId,
      userId,
    });

    return NextResponse.json({
      ok: true,
      connectionId: result.connectionId,
      dataTableId: result.dataTableId,
      storagePath: result.storagePath,
    });
  } catch (err) {
    console.error("excel-upload:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Error al subir el archivo",
        stage: "upload_storage",
      },
      { status: 500 }
    );
  }
}
