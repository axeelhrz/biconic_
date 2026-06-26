import path from "path";
import fs from "fs";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createImportAdminClient } from "@/lib/excel-import/import-admin-client";
import {
  getLocalExcelAbsolutePath,
  hasLocalExcelFile,
} from "@/lib/storage/excel-upload-storage";
import { getPresignedDownloadUrl } from "@/lib/storage/s3-excel-storage";
import { getServerAuthUser } from "@/lib/supabase/server-backend";

const getExtensionFromPath = (filePath: string) =>
  path.extname(filePath || "").replace(".", "").toLowerCase();

async function loadWorkbookBuffer(
  storagePath: string,
  cookieHeader?: string | null
): Promise<Buffer> {
  if (hasLocalExcelFile(storagePath)) {
    return fs.promises.readFile(getLocalExcelAbsolutePath(storagePath));
  }

  try {
    const url = await getPresignedDownloadUrl(storagePath, { cookieHeader });
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error descargando archivo: ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? err.message
        : "Archivo no encontrado en almacenamiento."
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.connectionId) {
      return NextResponse.json({ error: "Falta connectionId" }, { status: 400 });
    }

    const authUser = await getServerAuthUser();
    if (!authUser?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const admin = createImportAdminClient();
    const { data: connection, error: connectionError } = await admin
      .from("connections")
      .select("storage_object_path, original_file_name, user_id")
      .eq("id", body.connectionId)
      .single();

    if (connectionError || !connection?.storage_object_path) {
      return NextResponse.json(
        { error: "No se encontró el archivo de la conexión." },
        { status: 404 }
      );
    }

    if (
      connection.user_id &&
      connection.user_id !== authUser.id &&
      authUser.app_role !== "APP_ADMIN"
    ) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const storagePath = connection.storage_object_path as string;
    const buffer = await loadWorkbookBuffer(storagePath, req.headers.get("cookie"));
    const ext = getExtensionFromPath(storagePath);
    const originalFileName =
      (connection.original_file_name as string | null) ?? storagePath;

    let sheetNames: string[] = [];
    if (ext === "csv") {
      sheetNames = ["Sheet1"];
    } else {
      const workbook = XLSX.read(buffer, { type: "buffer", bookSheets: true });
      sheetNames = workbook.SheetNames ?? [];
    }

    return NextResponse.json({
      sheets: sheetNames,
      originalFileName,
      storagePath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[process-excel/sheets]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
