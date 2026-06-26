import { NextResponse } from "next/server";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import {
  createExcelConnectionRecord,
  requireAuthUserId,
} from "@/lib/excel-import/create-excel-connection";
import {
  EXCEL_UPLOAD_MAX_BYTES,
  EXCEL_UPLOAD_MAX_MB,
} from "@/lib/excel-import/upload-limits";
import {
  excelContentType,
  getPresignedUploadUrl,
  isVercelRuntime,
} from "@/lib/storage/s3-excel-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!shouldUseOwnBackend()) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  try {
    const userId = await requireAuthUserId();
    const body = await req.json();
    const connectionName = String(body?.connectionName ?? "").trim();
    const clientId = String(body?.clientId ?? "").trim();
    const fileName = String(body?.fileName ?? "").trim();
    const fileSize = Number(body?.fileSize ?? 0);

    if (!connectionName) {
      return NextResponse.json({ error: "Nombre de conexión requerido" }, { status: 400 });
    }
    if (!clientId) {
      return NextResponse.json({ error: "Cliente requerido" }, { status: 400 });
    }
    if (!fileName) {
      return NextResponse.json({ error: "Nombre de archivo requerido" }, { status: 400 });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "Tamaño de archivo inválido" }, { status: 400 });
    }
    if (fileSize > EXCEL_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { error: `Archivo demasiado grande (máx. ${EXCEL_UPLOAD_MAX_MB}MB)` },
        { status: 413 }
      );
    }

    const allowed = ["xlsx", "xls", "xlsm", "csv", "ods"];
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (!ext || !allowed.includes(ext)) {
      return NextResponse.json(
        { error: "Formato no soportado. Usá .xlsx, .xls, .xlsm, .csv u .ods." },
        { status: 400 }
      );
    }

    const record = await createExcelConnectionRecord({
      connectionName,
      clientId,
      userId,
      fileName,
    });

    const cookieHeader = req.headers.get("cookie");
    let presigned: { url: string; key: string };
    try {
      presigned = await getPresignedUploadUrl(
        record.storagePath,
        excelContentType(fileName),
        cookieHeader
      );
    } catch (presignErr) {
      const detail =
        presignErr instanceof Error ? presignErr.message : "No se pudo preparar la subida";
      const hint = isVercelRuntime()
        ? " Configurá Cloudflare R2 (S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET) en Railway."
        : "";
      return NextResponse.json(
        {
          error: `Almacenamiento no disponible: ${detail}.${hint}`,
          stage: "upload_storage",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      connectionId: record.connectionId,
      dataTableId: record.dataTableId,
      storagePath: record.storagePath,
      uploadUrl: presigned.url,
    });
  } catch (err) {
    console.error("excel-upload/init:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Error al iniciar la subida",
        stage: "upload_storage",
      },
      { status: 500 }
    );
  }
}
