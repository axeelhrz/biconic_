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
import * as XLSX from "xlsx";

// Forzar IPv4 para evitar ECONNRESET
dns.setDefaultResultOrder("ipv4first");

// --- CONFIGURACIÓN ---
const INSERT_BATCH_SIZE = 2000;
const SAMPLE_SIZE = 1000;
const PROGRESS_UPDATE_INTERVAL = 2000; // Actualizar DB cada X filas
const MAX_WARNINGS = 20;

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

type ParseMode = "strict" | "tolerant" | "mixed";
type FileFormat = "xlsx" | "xlsm" | "xls" | "ods" | "csv";
type SheetSelection = {
  sheetName: string;
  sheetIndex: number; // 1-based index
};

class StageError extends Error {
  stage: string;
  details?: string;
  constructor(stage: string, message: string, details?: string) {
    super(message);
    this.name = "StageError";
    this.stage = stage;
    this.details = details;
  }
}

const getExtensionFromPath = (filePath: string) =>
  path.extname(filePath || "").replace(".", "").toLowerCase();

const detectFileFormat = (
  filePath: string,
  preferredExtension?: string
): FileFormat => {
  const extension = (preferredExtension || getExtensionFromPath(filePath)).toLowerCase();
  if (extension === "csv") return "csv";
  if (extension === "xls") return "xls";
  if (extension === "ods") return "ods";
  if (extension === "xlsm") return "xlsm";
  if (extension === "xlsx") return "xlsx";

  const buffer = Buffer.alloc(4);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, 4, 0);
  } finally {
    fs.closeSync(fd);
  }

  const signature = buffer.toString("hex");
  if (signature === "504b0304") return "xlsx";
  if (signature.startsWith("d0cf11e0")) return "xls";
  return "csv";
};

const getSheetNamesFromWorkbook = (filePath: string): string[] => {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  return Array.isArray(workbook.SheetNames)
    ? workbook.SheetNames.filter(Boolean)
    : [];
};

const resolveSheetSelection = (
  sheetNames: string[],
  requestedSheet: string | undefined,
  parseMode: ParseMode,
  warnings: string[]
): SheetSelection => {
  if (sheetNames.length === 0) {
    throw new Error("El archivo no contiene hojas legibles.");
  }

  if (!requestedSheet) {
    return { sheetName: sheetNames[0], sheetIndex: 1 };
  }

  const exactIndex = sheetNames.indexOf(requestedSheet);
  if (exactIndex >= 0) {
    return { sheetName: sheetNames[exactIndex], sheetIndex: exactIndex + 1 };
  }

  const normalizedRequested = requestedSheet.trim().toLowerCase();
  const relaxedIndex = sheetNames.findIndex(
    (sheet) => sheet.trim().toLowerCase() === normalizedRequested
  );

  if (relaxedIndex >= 0) {
    const resolvedName = sheetNames[relaxedIndex];
    if (requestedSheet !== resolvedName) {
      warnings.push(
        `La hoja "${requestedSheet}" no coincidía exactamente. Se utilizó "${resolvedName}".`
      );
    }
    return { sheetName: resolvedName, sheetIndex: relaxedIndex + 1 };
  }

  if (parseMode === "strict") {
    throw new Error(
      `La hoja seleccionada "${requestedSheet}" no existe en el archivo (modo: ${parseMode}). Hojas detectadas: ${sheetNames.join(", ")}.`
    );
  }

  warnings.push(
    `La hoja "${requestedSheet}" no existe. Se utilizó "${sheetNames[0]}".`
  );
  return { sheetName: sheetNames[0], sheetIndex: 1 };
};

// --- ⭐ GENERADOR HÍBRIDO OPTIMIZADO ⭐ ---
async function* getRowGenerator(
  filePath: string,
  format: FileFormat,
  selectedSheet?: string,
  selectedSheetIndex?: number
) {
  if (format === "csv") {
    const separator = detectSeparator(filePath);
    console.log(
      `[LOG] Modo: CSV Stream. Separador detectado: [ ${
        separator === "\t" ? "TAB" : separator
      } ]`
    );

    const stream = fs.createReadStream(filePath).pipe(
      csvParser({
        headers: false,
        separator,
      })
    );

    for await (const row of stream) {
      yield Object.values(row);
    }
    return;
  }

  if (format === "xls" || format === "ods") {
    console.log(`[LOG] Modo: ${format.toUpperCase()} (SheetJS)`);
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const sheetName =
      selectedSheet && workbook.SheetNames.includes(selectedSheet)
        ? selectedSheet
        : workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      raw: false,
    }) as any[][];
    for (const row of rows) {
      yield Array.isArray(row) ? row : [];
    }
    return;
  }

  console.log("[LOG] Modo: XLSX/XLSM Stream (ExcelJS)");
  const options: any = {
    entries: "emit",
    sharedStrings: "cache",
    styles: "cache",
    hyperlinks: "ignore",
  };
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, options);
  const targetSheetIndex = selectedSheetIndex ?? 1;
  let sheetIdx = 0;
  let firstSheetProcessed = false;

  for await (const worksheetReader of workbookReader) {
    sheetIdx++;
    const shouldProcess = selectedSheet
      ? sheetIdx === targetSheetIndex
      : !firstSheetProcessed;
    if (!shouldProcess) continue;
    firstSheetProcessed = true;
    for await (const row of worksheetReader) {
      if (Array.isArray(row.values)) {
        yield row.values.slice(1);
      }
    }
    if (!selectedSheet) break;
  }

  if (selectedSheet && !firstSheetProcessed) {
    throw new Error(`La hoja "${selectedSheet}" no existe en el archivo.`);
  }
}

// Tiempo máximo de procesamiento (no dejar "Procesando" para siempre)
const IMPORT_TIMEOUT_MS = 12 * 60 * 1000; // 12 minutos

// --- PROCESAMIENTO EN BACKGROUND ---
async function processDataImport(
  connectionId: string,
  dataTableId: string,
  supabaseAdmin: any,
  dbUrl: string,
  parseMode: ParseMode,
  selectedSheet?: string | null
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

  const deadlineTs = Date.now() + IMPORT_TIMEOUT_MS;
  const assertNotTimedOut = () => {
    if (Date.now() >= deadlineTs) {
      throw new Error("TIMEOUT");
    }
  };

  const runImport = async () => {
    try {
      assertNotTimedOut();
      if (!dbUrl || dbUrl.trim() === "") {
        await markFailed("SUPABASE_DB_URL no está configurada. Configurala en .env.local (Supabase → Settings → Database → Connection string).");
        return;
      }

      // 1. DESCARGA EFICIENTE (MODIFICADO) -------------------------------------
      await supabaseAdmin
        .from("data_tables")
        .update({ import_status: "processing" })
        .eq("id", dataTableId);

    const { data: connection } = await supabaseAdmin
      .from("connections")
      .select("storage_object_path, original_file_name")
      .eq("id", connectionId)
      .single()
      .throwOnError();

    if (!connection.storage_object_path) {
      throw new Error(
        "La conexión no tiene un archivo asociado (storage_object_path es nulo)"
      );
    }
    const storagePath = connection.storage_object_path;
    const preferredExtension = getExtensionFromPath(
      connection.original_file_name || storagePath
    );

    const downloadToTempFile = async (): Promise<string> => {
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          assertNotTimedOut();
          attempts++;
          if (attempts > 1) {
            console.log(
              `[LOG] Reintentando descarga (${attempts}/${maxAttempts})...`
            );
          }

          const { data: signedData, error: signErr } = await supabaseAdmin.storage
            .from("excel-uploads")
            .createSignedUrl(storagePath, 3600);

          if (signErr) throw signErr;
          if (!signedData?.signedUrl) {
            throw new Error("No se pudo generar URL firmada");
          }

          const response = await fetch(signedData.signedUrl);
          if (!response.ok) {
            throw new Error(`Error descargando archivo: ${response.statusText}`);
          }
          if (!response.body) {
            throw new Error("El cuerpo de la respuesta está vacío");
          }

          const tmpPath = path.join(
            os.tmpdir(),
            `import-${dataTableId}-${Date.now()}.tmp`
          );

          await pipeline(
            Readable.fromWeb(response.body as any),
            fs.createWriteStream(tmpPath)
          );

          return tmpPath;
        } catch (err) {
          console.warn(`[WARN] Falló descarga (intento ${attempts}):`, err);
          if (attempts >= maxAttempts) {
            throw new StageError(
              "temp_file_access",
              "No se pudo descargar el archivo temporal para procesarlo.",
              err instanceof Error ? err.message : String(err)
            );
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      throw new StageError(
        "temp_file_access",
        "No se pudo preparar el archivo temporal."
      );
    };

    tempFilePath = await downloadToTempFile();
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
      .update({ import_status: "processing" })
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
    const ensureTempFileReadable = async () => {
      if (!tempFilePath) {
        throw new StageError(
          "temp_file_access",
          "El archivo temporal no está inicializado."
        );
      }
      try {
        await fs.promises.access(tempFilePath, fs.constants.R_OK);
      } catch (err) {
        try {
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (_) {}
        tempFilePath = await downloadToTempFile();
        try {
          await fs.promises.access(tempFilePath, fs.constants.R_OK);
        } catch (err2) {
          throw new StageError(
            "temp_file_access",
            "Cannot access file en /tmp para iniciar el parser.",
            err2 instanceof Error ? err2.message : String(err2)
          );
        }
      }
    };
    const warnings: string[] = [];
    await ensureTempFileReadable();
    assertNotTimedOut();
    const fileFormat = detectFileFormat(tempFilePath, preferredExtension);
    let finalSelectedSheet = selectedSheet || undefined;
    let finalSelectedSheetIndex: number | undefined = undefined;

    if (fileFormat !== "csv") {
      let sheetNames: string[] = [];
      try {
        sheetNames = getSheetNamesFromWorkbook(tempFilePath);
      } catch (err) {
        await ensureTempFileReadable();
        try {
          sheetNames = getSheetNamesFromWorkbook(tempFilePath);
        } catch (err2) {
          throw new StageError(
            "temp_file_access",
            "No se pudo leer el workbook desde /tmp.",
            err2 instanceof Error ? err2.message : String(err2)
          );
        }
      }
      const selection = resolveSheetSelection(
        sheetNames,
        finalSelectedSheet,
        parseMode,
        warnings
      );
      finalSelectedSheet = selection.sheetName;
      finalSelectedSheetIndex = selection.sheetIndex;
    } else {
      finalSelectedSheet = "CSV";
    }

    let rowGenerator = getRowGenerator(
      tempFilePath,
      fileFormat,
      finalSelectedSheet,
      finalSelectedSheetIndex
    );

    let generatorRetried = false;
    const consumeRows = async () => {
      for await (const values of rowGenerator) {
        assertNotTimedOut();
        if (!values || values.length === 0) continue;
        if (values.every((v: any) => v === null || v === "" || v === undefined))
          continue;

        if (rowCount === 0) {
          headers = values.map(String);
          headersSanitized = headers.map(sanitizeColumnName);

          const numCols = headers.length;
          if (numCols > 0) {
            const maxSafeParams = 60000;
            const calculatedBatch = Math.floor(maxSafeParams / numCols);
            currentBatchSize = Math.min(INSERT_BATCH_SIZE, calculatedBatch);
            console.log(
              `[LOG] Batch Size ajustado a: ${currentBatchSize} filas (Columnas: ${numCols})`
            );
          }

          rowCount++;
          continue;
        }

        if (values.length !== headers.length) {
          if (parseMode === "strict") {
            throw new Error(
              `La fila ${rowCount + 1} tiene ${values.length} columnas y se esperaban ${headers.length}.`
            );
          }
          if (warnings.length < MAX_WARNINGS) {
            warnings.push(
              `Fila ${rowCount + 1} normalizada por diferencia de columnas (${values.length}/${headers.length}).`
            );
          }
        }
        const normalizedValues =
          values.length > headers.length
            ? values.slice(0, headers.length)
            : values.length < headers.length
              ? [...values, ...Array(headers.length - values.length).fill(null)]
              : values;

        buffer.push(normalizedValues);

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
            .update({ import_status: "processing" })
            .eq("id", dataTableId);
        }

        if (isTableCreated && buffer.length >= currentBatchSize) {
          while (buffer.length >= currentBatchSize) {
            const chunk = buffer.splice(0, currentBatchSize);
            await insertBatch(sql, tableName, headersSanitized, chunk);
          }

          if (rowCount % PROGRESS_UPDATE_INTERVAL === 0) {
            console.log(`[PROGRESO] Insertadas: ${rowCount} filas...`);
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
    };

    try {
      await consumeRows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        !generatorRetried &&
        msg.toLowerCase().includes("cannot access file")
      ) {
        generatorRetried = true;
        await ensureTempFileReadable();
        rowGenerator = getRowGenerator(
          tempFilePath,
          fileFormat,
          finalSelectedSheet,
          finalSelectedSheetIndex
        );
        await consumeRows();
      } else {
        throw err;
      }
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
        error_message: warnings.length
          ? `Advertencias:\n${warnings.join("\n")}`
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dataTableId);

    console.log(`[EXITO] Completado. Total: ${rowCount - 1} filas.`);
    } catch (error: any) {
      console.error("[ERROR BACKGROUND]", error);
      let msg = error?.message || "Error desconocido";
      if (error instanceof StageError) {
        msg = `[${error.stage}] ${error.message}${error.details ? ` | ${error.details}` : ""}`;
      }
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
    await runImport();
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
      return NextResponse.json(
        {
          error: "Faltan parámetros.",
          stage: "request_validation",
          details: "Se requieren connectionId y dataTableId.",
        },
        { status: 400 }
      );
    }

    const { connectionId, dataTableId } = body;
    const parseMode: ParseMode =
      body?.parseMode === "strict" ||
      body?.parseMode === "tolerant" ||
      body?.parseMode === "mixed"
        ? body.parseMode
        : "mixed";
    const selectedSheet =
      typeof body?.selectedSheet === "string" && body.selectedSheet.trim() !== ""
        ? body.selectedSheet.trim()
        : null;

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
      return NextResponse.json(
        {
          error: "Configuración del servidor incompleta.",
          stage: "server_config",
          details: msg,
        },
        { status: 503 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: queueError } = await supabaseAdmin
      .from("data_tables")
      .update({ import_status: "processing" })
      .eq("id", dataTableId);
    if (queueError) {
      return NextResponse.json(
        {
          error: "No se pudo encolar la importación.",
          stage: "process_excel_start",
          details: queueError.message,
        },
        { status: 500 }
      );
    }

    const importPromise = processDataImport(
      connectionId,
      dataTableId,
      supabaseAdmin,
      process.env.SUPABASE_DB_URL!,
      parseMode,
      selectedSheet
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
    return NextResponse.json(
      {
        error: "Error interno al iniciar la importación.",
        stage: "process_excel_start",
        details:
          error?.message ||
          "Error desconocido al preparar el procesamiento.",
      },
      { status: 500 }
    );
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
