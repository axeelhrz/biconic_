import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import path from "path";
import * as XLSX from "xlsx";

const getExtensionFromPath = (filePath: string) =>
  path.extname(filePath || "").replace(".", "").toLowerCase();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.connectionId) {
      return NextResponse.json({ error: "Falta connectionId" }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Configuración del servidor incompleta." },
        { status: 503 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from("connections")
      .select("storage_object_path, original_file_name")
      .eq("id", body.connectionId)
      .single();

    if (connectionError || !connection?.storage_object_path) {
      return NextResponse.json(
        { error: "No se encontró el archivo de la conexión." },
        { status: 404 }
      );
    }

    const { data: signedData, error: signErr } = await supabaseAdmin.storage
      .from("excel-uploads")
      .createSignedUrl(connection.storage_object_path, 300);

    if (signErr || !signedData?.signedUrl) {
      return NextResponse.json(
        { error: "No se pudo generar URL firmada del archivo." },
        { status: 500 }
      );
    }

    const response = await fetch(signedData.signedUrl);
    if (!response.ok) {
      return NextResponse.json(
        { error: "No se pudo descargar el archivo." },
        { status: 500 }
      );
    }

    const extension = getExtensionFromPath(
      connection.original_file_name || connection.storage_object_path
    );
    if (extension === "csv") {
      return NextResponse.json({
        sheets: ["CSV"],
        defaultSheet: "CSV",
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheets = Array.isArray(workbook.SheetNames)
      ? workbook.SheetNames.filter(Boolean)
      : [];

    if (sheets.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron hojas legibles en el archivo." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      sheets,
      defaultSheet: sheets[0],
      degraded: false,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al inspeccionar hojas.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
