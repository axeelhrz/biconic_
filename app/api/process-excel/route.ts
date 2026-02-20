import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import postgres from "postgres";
import { NextResponse } from "next/server";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";
import dns from "node:dns";
import csvParser from "csv-parser"; // ⚡ NECESARIO: npm install csv-parser

// Forzar IPv4 para evitar ECONNRESET
dns.setDefaultResultOrder("ipv4first");

// --- CONFIGURACIÓN ---
const INSERT_BATCH_SIZE = 2000;
const SAMPLE_SIZE = 1000;
const PROGRESS_UPDATE_INTERVAL = 2000; // Actualizar DB cada X filas

// --- UTILIDADES ---
const sanitizeColumnName = (name: any) =>
  `"${
    name
      ? name
          .toString()
          .replace(/[^a-zA-Z0-9_]/g, "_")
          .toLowerCase()
      : "unnamed_column"
  }"`;

const cleanValue = (val: any) => {
  if (val === null || val === undefined) return null;
  // ExcelJS devuelve objetos Date, CSV devuelve strings
  if (val instanceof Date) return val.toISOString().split("T")[0];
  if (typeof val === "object")
    return val.text || val.result || JSON.stringify(val);
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return null;
    return trimmed;
  }
  return val;
};

// --- INFERENCIA DE TIPOS ---
const isInteger = (v: string) => /^-?\d+$/.test(v);
const isFloat = (v: string) => /^-?\d+(\.\d+)?$/.test(v) && !isInteger(v);
const isBoolean = (v: string) => /^(true|false|t|f|1|0)$/i.test(v);
const isDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));

type ColumnType = "TEXT" | "BIGINT" | "FLOAT" | "BOOLEAN" | "DATE";

function inferColumnTypes(rows: any[][], headerCount: number): ColumnType[] {
  if (rows.length === 0) return Array(headerCount).fill("TEXT");
  const columnChecks = Array(headerCount)
    .fill(0)
    .map(() => ({ isBool: true, isDate: true, isInt: true, isFloat: true }));

  for (const row of rows) {
    for (let i = 0; i < headerCount; i++) {
      let value = row[i];
      // Normalización para inferencia
      if (typeof value === "object" && value !== null) {
        if (value instanceof Date) value = value.toISOString().split("T")[0];
        else if ("text" in value) value = value.text;
        else value = String(value);
      }
      if (value === null || value === undefined || String(value).trim() === "")
        continue;

      const strValue = String(value);
      const checks = columnChecks[i];
      if (checks.isBool && !isBoolean(strValue)) checks.isBool = false;
      if (checks.isDate && !isDate(strValue)) checks.isDate = false;
      if (checks.isInt && !isInteger(strValue)) checks.isInt = false;
      if (checks.isFloat && !isFloat(strValue) && !isInteger(strValue))
        checks.isFloat = false;
    }
  }
  return columnChecks.map((checks) => {
    if (checks.isBool) return "BOOLEAN";
    if (checks.isDate) return "DATE";
    if (checks.isInt) return "BIGINT";
    if (checks.isFloat) return "FLOAT";
    return "TEXT";
  });
}

// --- DETECCIÓN DE SEPARADOR ---
function detectSeparator(filePath: string): string {
  const buffer = Buffer.alloc(4096);
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    // Leemos el inicio del archivo
    fs.readSync(fd, buffer, 0, 4096, 0);
  } catch (e) {
    return ","; // Fallback por defecto
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }

  const text = buffer.toString("utf-8");
  const firstLine = text.split(/\r?\n/)[0]; // Analizamos solo la primera línea

  if (!firstLine) return ",";

  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const pipeCount = (firstLine.match(/\|/g) || []).length;

  const max = Math.max(commaCount, semiCount, tabCount, pipeCount);

  if (max === 0) return ",";
  if (max === semiCount) return ";";
  if (max === tabCount) return "\t";
  if (max === pipeCount) return "|";
  return ",";
}

// --- ⭐ GENERADOR HÍBRIDO OPTIMIZADO ⭐ ---
async function* getRowGenerator(filePath: string) {
  // 1. Detección Magic Bytes (Primeros 4 bytes)
  const buffer = Buffer.alloc(4);
  const fd = fs.openSync(filePath, "r");
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);

  const isXlsx = buffer.toString("hex") === "504b0304"; // Firma PK.. (ZIP)

  if (isXlsx) {
    console.log("[LOG] Modo: XLSX Stream (ExcelJS)");
    const options: any = {
      entries: "emit",
      sharedStrings: "cache",
      styles: "cache",
      hyperlinks: "ignore",
    };
    const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(
      filePath,
      options
    );

    let sheetIdx = 0;
    for await (const worksheetReader of workbookReader) {
      sheetIdx++;
      if (sheetIdx > 1) break;
      for await (const row of worksheetReader) {
        if (Array.isArray(row.values)) {
          yield row.values.slice(1);
        }
      }
    }
  } else {
    // Detectar separador automáticamente (Fix para CSV con punto y coma)
    const separator = detectSeparator(filePath);
    console.log(
      `[LOG] Modo: CSV Stream. Separador detectado: [ ${
        separator === "\t" ? "TAB" : separator
      } ]`
    );

    // ⚡ STREAM REAL PARA CSV
    const stream = fs.createReadStream(filePath).pipe(
      csvParser({
        headers: false,
        separator: separator,
      })
    );

    for await (const row of stream) {
      // csv-parser devuelve objeto { '0': 'val', '1': 'val' } si headers es false
      // o array dependiendo de la versión. Lo forzamos a array.
      yield Object.values(row);
    }
  }
}

// Tiempo máximo de procesamiento (no dejar "Procesando" para siempre)
const IMPORT_TIMEOUT_MS = 12 * 60 * 1000; // 12 minutos

// --- PROCESAMIENTO EN BACKGROUND ---
async function processDataImport(
  connectionId: string,
  dataTableId: string,
  supabaseAdmin: any,
  dbUrl: string
) {
  let tempFilePath: string | null = null;
  let sql: any = null;
  let terminalStatus = false; // true cuando ya pusimos "completed" o "failed"

  const markFailed = async (message: string) => {
    if (terminalStatus) return;
    terminalStatus = true;
    try {
      await supabaseAdmin
        .from("data_tables")
        .update({ import_status: "failed", error_message: message })
        .eq("id", dataTableId);
    } catch (_) {}
  };

  console.log(
    `[BACKGROUND] Iniciando importación para Data Table: ${dataTableId}`
  );

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("TIMEOUT")), IMPORT_TIMEOUT_MS);
  });

  const runImport = async () => {
    try {
      if (!dbUrl || dbUrl.trim() === "") {
        await markFailed("SUPABASE_DB_URL no está configurada. Configurala en .env.local (Supabase → Settings → Database → Connection string).");
        return;
      }

      // 1. DESCARGA EFICIENTE (MODIFICADO) -------------------------------------
      await supabaseAdmin
        .from("data_tables")
        .update({ import_status: "downloading_file" })
        .eq("id", dataTableId);

    const { data: connection } = await supabaseAdmin
      .from("connections")
      .select("storage_object_path")
      .eq("id", connectionId)
      .single()
      .throwOnError();

    if (!connection.storage_object_path) {
      throw new Error(
        "La conexión no tiene un archivo asociado (storage_object_path es nulo)"
      );
    }
    const storagePath = connection.storage_object_path;

    let downloadSuccess = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (!downloadSuccess && attempts < maxAttempts) {
      try {
        attempts++;
        if (attempts > 1)
          console.log(
            `[LOG] Reintentando descarga (${attempts}/${maxAttempts})...`
          );

        // CAMBIO CLAVE: No usamos .download(), usamos createSignedUrl
        const { data: signedData, error: signErr } = await supabaseAdmin.storage
          .from("excel-uploads")
          .createSignedUrl(storagePath, 3600); // URL válida por 1 hora (antes 60s)

        if (signErr) throw signErr;
        if (!signedData?.signedUrl)
          throw new Error("No se pudo generar URL firmada");

        // Hacemos el fetch manual
        const response = await fetch(signedData.signedUrl);
        if (!response.ok)
          throw new Error(`Error descargando archivo: ${response.statusText}`);
        if (!response.body)
          throw new Error("El cuerpo de la respuesta está vacío");

        tempFilePath = path.join(
          os.tmpdir(),
          `import-${dataTableId}-${Date.now()}.tmp`
        );

        // Pipe directo del Web Stream al File System (Sin cargar todo en RAM)
        // Nota: response.body es un ReadableStream web, pipeline lo maneja bien en Node recientes
        // Si te da error de tipos, usa Readable.fromWeb(response.body as any)
        await pipeline(
          Readable.fromWeb(response.body as any),
          fs.createWriteStream(tempFilePath)
        );

        downloadSuccess = true;
        console.log("[LOG] Descarga completada exitosamente.");
      } catch (err) {
        console.warn(`[WARN] Falló descarga (intento ${attempts}):`, err);
        if (attempts >= maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, 2000)); // Esperar 2s
      }
    }
    // -----------------------------------------------------------------------

    // 2. CONEXIÓN DB
    sql = postgres(dbUrl, {
      ssl: { rejectUnauthorized: false },
      prepare: false,
      max: 1,
      connect_timeout: 20,
    });

    // 3. PROCESAMIENTO STREAMING
    await supabaseAdmin
      .from("data_tables")
      .update({ import_status: "creating_table" })
      .eq("id", dataTableId);

    const tableName = `import_${connectionId.replaceAll("-", "_")}`;
    let headers: string[] = [];
    let headersSanitized: string[] = [];
    let inferredTypes: string[] = [];
    let buffer: any[][] = [];
    let isTableCreated = false;
    let rowCount = 0;
    let currentBatchSize = INSERT_BATCH_SIZE;

    if (!tempFilePath) throw new Error("Error interno: tempFilePath es nulo");
    const rowGenerator = getRowGenerator(tempFilePath);

    for await (const values of rowGenerator) {
      if (!values || values.length === 0) continue;
      if (values.every((v: any) => v === null || v === "" || v === undefined))
        continue;

      if (rowCount === 0) {
        headers = values.map(String);
        headersSanitized = headers.map(sanitizeColumnName);

        // ⚡ AJUSTE DINÁMICO DE BATCH SIZE ⚡
        // Postgres tiene un límite de 65535 parámetros por query.
        // BatchSize * NumColumnas debe ser < 65535.
        const numCols = headers.length;
        if (numCols > 0) {
          const maxSafeParams = 60000; // Margen de seguridad
          const calculatedBatch = Math.floor(maxSafeParams / numCols);
          currentBatchSize = Math.min(INSERT_BATCH_SIZE, calculatedBatch);
          console.log(
            `[LOG] Batch Size ajustado a: ${currentBatchSize} filas (Columnas: ${numCols})`
          );
        }

        rowCount++;
        continue;
      }

      buffer.push(values);

      // --- FASE 1: INFERENCIA DE TIPOS ---
      if (!isTableCreated && buffer.length >= SAMPLE_SIZE) {
        console.log(`[LOG] Inferiendo tipos con ${buffer.length} filas...`);
        inferredTypes = inferColumnTypes(buffer, headers.length);

        const cols = headersSanitized
          .map((h, i) => `${h} ${inferredTypes[i] || "TEXT"}`)
          .join(", ");

        await sql.unsafe(
          `CREATE TABLE IF NOT EXISTS data_warehouse.${tableName} (_import_id BIGSERIAL PRIMARY KEY, ${cols})`
        );

        isTableCreated = true;
        await supabaseAdmin
          .from("data_tables")
          .update({ import_status: "inserting_rows" })
          .eq("id", dataTableId);
      }

      // --- FASE 2: INSERCIÓN POR LOTES ---
      if (isTableCreated && buffer.length >= currentBatchSize) {
        // Procesar el buffer en trozos respetando el límite de parámetros
        while (buffer.length >= currentBatchSize) {
          const chunk = buffer.splice(0, currentBatchSize);
          await insertBatch(sql, tableName, headersSanitized, chunk);
        }

        if (rowCount % PROGRESS_UPDATE_INTERVAL === 0) {
          console.log(`[PROGRESO] Insertadas: ${rowCount} filas...`);
          // Reporte de Progreso en Realtime (Silencioso)
          try {
            await supabaseAdmin
              .from("data_tables")
              .update({ total_rows: rowCount })
              .eq("id", dataTableId);
          } catch (progressError) {
            console.warn("[WARN] Error actualizando progreso:", progressError);
          }
        }
      }
      rowCount++;
    }

    // --- FASE 3: LIMPIEZA FINAL ---
    if (!isTableCreated && buffer.length > 0) {
      // Caso archivo pequeño (menor que SAMPLE_SIZE)
      inferredTypes = inferColumnTypes(buffer, headers.length);
      const cols = headersSanitized
        .map((h, i) => `${h} ${inferredTypes[i] || "TEXT"}`)
        .join(", ");
      await sql.unsafe(
        `CREATE TABLE IF NOT EXISTS data_warehouse.${tableName} (_import_id BIGSERIAL PRIMARY KEY, ${cols})`
      );
    }

    if (buffer.length > 0) {
      // Flush final con batching seguro
      while (buffer.length > 0) {
        const chunk = buffer.splice(0, currentBatchSize);
        await insertBatch(sql, tableName, headersSanitized, chunk);
      }
    }

    const columnMetadata = headers.map((h, i) => ({
      name: headersSanitized[i].replaceAll('"', ""),
      original_name: h,
      type: inferredTypes[i] || "TEXT",
    }));

    if (terminalStatus) return;
    terminalStatus = true;
    await supabaseAdmin
      .from("data_tables")
      .update({
        import_status: "completed",
        columns: columnMetadata,
        total_rows: rowCount - 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dataTableId);

    console.log(`[EXITO] Completado. Total: ${rowCount - 1} filas.`);
    } catch (error: any) {
      console.error("[ERROR BACKGROUND]", error);
      let msg = error?.message || "Error desconocido";
      if (typeof msg === "string" && msg.includes("does not exist") && msg.toLowerCase().includes("schema"))
        msg = "El schema data_warehouse no existe. Ejecutá las migraciones de Supabase (supabase db push o desde el panel SQL).";
      if (typeof msg === "string" && (msg.includes("ECONNREFUSED") || msg.includes("connection")))
        msg = "No se pudo conectar a la base de datos. Revisá que SUPABASE_DB_URL en .env.local sea correcta (Supabase → Settings → Database).";
      await markFailed(msg);
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (_) {}
      }
      if (sql) await sql.end();
    }
  };

  try {
    await Promise.race([runImport(), timeoutPromise]);
  } catch (e: any) {
    if (e?.message === "TIMEOUT") await markFailed("Timeout (máximo 12 minutos).");
  } finally {
    if (!terminalStatus) await markFailed("Procesamiento interrumpido.");
  }
}

// --- ENDPOINT PRINCIPAL (Fire-and-Forget) ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.connectionId || !body?.dataTableId) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
    }

    const { connectionId, dataTableId } = body;

    // Validar variables de entorno antes de iniciar (evita que "siempre falle" sin mensaje claro)
    const missing: string[] = [];
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!process.env.SUPABASE_DB_URL) missing.push("SUPABASE_DB_URL");

    if (missing.length > 0) {
      const msg = `Configuración del servidor incompleta. Agregá en .env.local: ${missing.join(", ")}. SUPABASE_DB_URL es la URL de conexión directa a Postgres (Supabase → Settings → Database).`;
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
          );
          await supabaseAdmin
            .from("data_tables")
            .update({ import_status: "failed", error_message: msg })
            .eq("id", dataTableId);
        } catch (_) {}
      }
      return NextResponse.json({ error: msg }, { status: 503 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabaseAdmin
      .from("data_tables")
      .update({ import_status: "queued" })
      .eq("id", dataTableId);

    const importPromise = processDataImport(
      connectionId,
      dataTableId,
      supabaseAdmin,
      process.env.SUPABASE_DB_URL!
    ).catch((err) => console.error("[FATAL BACKGROUND ERROR]", err));

    // Next 15: after() evita que el proceso se corte al enviar la respuesta (Vercel/local)
    const { after } = await import("next/server");
    after(() => importPromise);

    return NextResponse.json({
      success: true,
      message: "Procesamiento iniciado en segundo plano",
    });
  } catch (error: any) {
    console.error("[ERROR POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function insertBatch(
  sql: any,
  table: string,
  headers: string[],
  rows: any[][]
) {
  if (!rows.length) return;

  const data = rows.map((r) => {
    const obj: any = {};
    headers.forEach((h, i) => (obj[h.replaceAll('"', "")] = cleanValue(r[i])));
    return obj;
  });

  try {
    await sql`INSERT INTO data_warehouse.${sql(table)} ${sql(data)}`;
  } catch (e: any) {
    console.warn("[WARN] Falló insert masivo, reintentando...", e.message);
    try {
      await sql`INSERT INTO data_warehouse.${sql(table)} ${sql(data)}`;
    } catch (retryError) {
      console.error("[ERROR INSERT] Perdida de datos en lote:", retryError);
      throw retryError;
    }
  }
}
