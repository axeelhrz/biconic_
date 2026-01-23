import { NextRequest, NextResponse } from "next/server";
import * as ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

// Asegurar runtime Node para manejar uploads grandes correctamente
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 60 * 1024 * 1024; // 60MB

export async function POST(req: NextRequest) {
  try {
    // Verificar autenticación
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Obtener el archivo del FormData
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const connectionName = formData.get("connectionName") as string;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No se proporcionó ningún archivo" },
        { status: 400 }
      );
    }

    if (!connectionName) {
      return NextResponse.json(
        { ok: false, error: "Nombre de conexión requerido" },
        { status: 400 }
      );
    }

    // Validar tamaño del archivo
    if (typeof file.size === "number" && file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: "El archivo es demasiado grande. Máximo permitido: 60MB",
        },
        { status: 413 }
      );
    }

    // Validar que sea un archivo Excel
    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: "El archivo debe ser un Excel (.xlsx o .xls)" },
        { status: 400 }
      );
    }

    // Convertir el archivo a buffer
    const arrayBuffer = await file.arrayBuffer();

    // Leer el archivo Excel con ExcelJS
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(arrayBuffer);
    } catch (e: any) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No se pudo leer el archivo Excel. Asegúrate de subir un .xlsx válido.",
        },
        { status: 400 }
      );
    }

    // Obtener la primera hoja
    const worksheet = workbook.worksheets[0];
    const firstSheetName = worksheet.name;

    // Convertir a JSON
    const jsonData: any[][] = [];
    worksheet.eachRow((row, rowNumber) => {
      const rowValues: any[] = [];
      row.eachCell((cell, colNumber) => {
        rowValues[colNumber - 1] = cell.value;
      });
      jsonData.push(rowValues);
    });

    // Procesar los datos para obtener headers y rows
    const headers = jsonData[0] as string[];
    const rows = jsonData.slice(1);

    // Crear estructura de datos procesada
    const processedData = {
      fileName: file.name,
      fileSize: file.size,
      sheetName: firstSheetName,
      headers: headers,
      totalRows: rows.length,
      data: rows.map((row: any[]) => {
        const rowObject: Record<string, any> = {};
        headers.forEach((header, index) => {
          rowObject[header] = row[index] || null;
        });
        return rowObject;
      }),
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.id,
    };

    // Crear la conexión en la tabla conections
    const { data: connectionData, error: connectionError } = await supabase
      .from("connections")
      .insert({
        name: connectionName,
        user_id: user.id,
        // Campos opcionales para conexión Excel
        database_host: "excel_file",
        database_name: file.name,
        database_user: "excel_user",
      } as any)
      .select()
      .single();

    if (connectionError) {
      throw new Error(`Error creando conexión: ${connectionError.message}`);
    }

    // Guardar los datos procesados en connection_data con referencia a la conexión
    const { error: dataError } = await supabase.from("connection_data" as any).insert({
      data: {
        ...processedData,
        connectionId: connectionData.id, // Agregar referencia a la conexión
      },
    });

    if (dataError) {
      // Si falla guardar los datos, eliminar la conexión creada
      await supabase.from("connections").delete().eq("id", connectionData.id);
      throw new Error(`Error guardando datos: ${dataError.message}`);
    }

    return NextResponse.json({
      ok: true,
      message: "Archivo Excel procesado correctamente",
      connectionId: connectionData.id,
      summary: {
        fileName: file.name,
        totalRows: rows.length,
        headers: headers,
        connectionName: connectionName,
      },
    });
  } catch (error: any) {
    console.error("Error procesando archivo Excel:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}
