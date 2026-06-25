import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import { getLocalExcelAbsolutePath } from "@/lib/storage/excel-upload-storage";
import { getServerAuthUser } from "@/lib/supabase/server-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  csv: "text/csv",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
};

export async function GET(req: Request) {
  if (!shouldUseOwnBackend()) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  const user = await getServerAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const storagePath = new URL(req.url).searchParams.get("path")?.trim();
  if (!storagePath) {
    return NextResponse.json({ error: "path requerido" }, { status: 400 });
  }

  if (!storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Sin permiso para este archivo" }, { status: 403 });
  }

  try {
    const abs = getLocalExcelAbsolutePath(storagePath);
    if (!fs.existsSync(abs)) {
      return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    }
    const ext = path.extname(abs).replace(".", "").toLowerCase();
    const bytes = await fs.promises.readFile(abs);
    return new NextResponse(bytes, {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("excel-file:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}
