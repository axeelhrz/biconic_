import ExcelJS from "exceljs";
import postgres from "postgres";
import { getBackendApiUrl } from "@/lib/api/backend-config";
import {
  createImportAdminClient,
  getImportDbUrl,
} from "@/lib/excel-import/import-admin-client";
import {
  getLocalExcelAbsolutePath,
  hasLocalExcelFile,
} from "@/lib/storage/excel-upload-storage";
import { getPresignedDownloadUrl, getS3ObjectReadableStream, getS3ObjectContentLength, isS3Configured } from "@/lib/storage/s3-excel-storage";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";
import dns from "node:dns";
import csvParser from "csv-parser"; // ⚡ NECESARIO: npm install csv-parser
import * as XLSX from "xlsx";
import {
  ensureDataTablesForSheets,
  excelConnectionTableKeys,
  listSheetNamesFromBuffer,
  loadWorkbookBufferForConnection,
} from "@/lib/excel-import/excel-sheet-tables";

// Forzar IPv4 para evitar ECONNRESET
dns.setDefaultResultOrder("ipv4first");

// --- CONFIGURACIÓN ---
/** Carpeta para temporales de importación (volumen con más espacio que /tmp si hace falta). */
function getImportTempDir(): string {
  const custom = process.env.IMPORT_TMP_DIR?.trim();
  if (custom) return custom;
  return os.tmpdir();
}

function isEnospcError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as NodeJS.ErrnoException & { code?: string };
  return e.code === "ENOSPC" || String(e.message ?? "").includes("ENOSPC");
}

function enospcImportMessage(): string {
  const onVercel = Boolean(process.env.VERCEL);
  return (
    "No hay espacio suficiente en disco para procesar el archivo. " +
    (onVercel
      ? "En Vercel el disco temporal es muy pequeño (~512 MB): usá solo la primera hoja en archivos grandes o procesá en un entorno con más espacio (Railway/local). "
      : "Liberá espacio en el servidor o configurá IMPORT_TMP_DIR en .env apuntando a una carpeta con más espacio. ") +
    "Los .xlsx/.xlsm se procesan por streaming; evitá importar todas las hojas en archivos muy grandes."
  );
}

const INSERT_BATCH_SIZE = 2000;
const SAMPLE_SIZE = 1000;
const PROGRESS_UPDATE_INTERVAL = 2000; // Actualizar DB cada X filas
const MAX_WARNINGS = 20;
const CURSOR_SAVE_INTERVAL = 10000;
const IMPORT_CURSOR_KEY = "__import_cursor_v1";
const DEBUG_INGEST_URL =
  "http://127.0.0.1:7710/ingest/20cf47c8-0473-4ba0-9564-fc0b0bf73d37";
const DEBUG_SESSION_ID = "ccff04";

// --- UTILIDADES ---
function normalizeHeaderLabel(value: unknown, index: number): string {
  if (value === null || value === undefined) {
    return `column_${index + 1}`;
  }
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }
  if (typeof value === "object") {
    const cell = value as Record<string, unknown>;
    if (typeof cell.text === "string" && cell.text.trim()) {
      return cell.text.trim();
    }
    if (cell.result !== null && cell.result !== undefined && cell.result !== "") {
      return String(cell.result).trim();
    }
    if (Array.isArray(cell.richText)) {
      const text = cell.richText
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String((part as { text?: unknown }).text ?? "")
            : ""
        )
        .join("")
        .trim();
      if (text) return text;
    }
    if (typeof cell.hyperlink === "string" && cell.hyperlink.trim()) {
      return cell.hyperlink.trim();
    }
    return `column_${index + 1}`;
  }
  const text = String(value).trim();
  if (!text || text === "[object Object]") {
    return `column_${index + 1}`;
  }
  return text;
}

const slugifyColumnBase = (name: string) => {
  const slug = name
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return slug || "unnamed_column";
};

const sanitizeColumnName = (name: string) => `"${slugifyColumnBase(name)}"`;

/** Evita CREATE TABLE con columnas duplicadas (p. ej. varios [object Object] en Excel). */
function buildUniqueSanitizedHeaders(values: unknown[]): string[] {
  const labels = values.map((value, index) => normalizeHeaderLabel(value, index));
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const base = slugifyColumnBase(label);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const unique = count === 0 ? base : `${base}_${count + 1}`;
    return `"${unique}"`;
  });
}

function coerceExcelCellValue(val: unknown): string | number | boolean | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString().split("T")[0];
  if (typeof val === "boolean" || typeof val === "number") return val;
  if (typeof val === "object") {
    const cell = val as Record<string, unknown>;
    // Referencia sin resolver de ExcelJS streaming (sharedStrings: emit)
    if ("sharedString" in cell) return null;
    if (typeof cell.text === "string") {
      const trimmed = cell.text.trim();
      return trimmed === "" ? null : trimmed;
    }
    if (cell.result !== null && cell.result !== undefined && cell.result !== "") {
      return coerceExcelCellValue(cell.result);
    }
    if (Array.isArray(cell.richText)) {
      const text = cell.richText
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String((part as { text?: unknown }).text ?? "")
            : ""
        )
        .join("")
        .trim();
      return text === "" ? null : text;
    }
    if (typeof cell.hyperlink === "string") {
      const trimmed = cell.hyperlink.trim();
      return trimmed === "" ? null : trimmed;
    }
    return null;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed === "" ? null : trimmed;
  }
  return val as string | number | boolean;
}

const cleanValue = (val: unknown) => coerceExcelCellValue(val);

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
      const coerced = coerceExcelCellValue(row[i]);
      if (coerced === null || coerced === undefined) continue;

      const strValue = String(coerced);
      if (strValue.trim() === "") continue;
      const checks = columnChecks[i];
      if (checks.isBool && !isBoolean(strValue)) checks.isBool = false;
      if (checks.isDate && !isDate(strValue)) checks.isDate = false;
      if (checks.isInt && !isInteger(strValue)) checks.isInt = false;
      if (checks.isFloat && !isFloat(strValue) && !isInteger(strValue))
        checks.isFloat = false;
    }
  }
  return columnChecks.map((checks: any) => {
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
export type { ParseMode };
type FileFormat = "xlsx" | "xlsm" | "xls" | "ods" | "csv";

/** Origen del archivo para el parser: ruta local o stream (solo xlsx/xlsm). */
type RowGeneratorSource =
  | { kind: "path"; path: string }
  | { kind: "xlsxStream"; stream: Readable };
type SheetSelection = {
  sheetName: string;
  sheetIndex: number; // 1-based index
};

type ImportCursor = {
  insertedRows: number;
  selectedSheet: string | null;
  parseMode: ParseMode;
  updatedAt: string;
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

/** Encadena otra invocación en Vercel antes de que corte maxDuration (importaciones muy grandes). */
type ImportContinuationPayload = {
  connectionId: string;
  dataTableId: string;
  parseMode: ParseMode;
  selectedSheet: string | null;
};

class ImportChunkBoundaryError extends Error {
  readonly payload: ImportContinuationPayload;
  constructor(payload: ImportContinuationPayload) {
    super("IMPORT_CHUNK_BOUNDARY");
    this.name = "ImportChunkBoundaryError";
    this.payload = payload;
  }
}

function getChunkWallMs(): number {
  const raw = process.env.PROCESS_EXCEL_CHUNK_MS?.trim();
  if (raw === "0") return 0;
  if (raw && Number.isFinite(Number(raw)) && Number(raw) > 0) {
    return Math.floor(Number(raw));
  }
  // Solo trocear en Vercel serverless (límite de duración). En Railway importar de una pasada.
  const onRailway =
    Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    Boolean(process.env.RAILWAY_PUBLIC_DOMAIN) ||
    Boolean(process.env.PROCESS_EXCEL_RUNNER_URL?.trim());
  if (onRailway || !process.env.VERCEL) return 0;
  return 180_000;
}

/** En Railway: copiar xlsx a disco local antes de parsear (evita stream lento desde R2). */
function shouldUseLocalXlsxCopy(expectedFileSize: number): boolean {
  if (process.env.VERCEL) return false;
  if (
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.PROCESS_EXCEL_RUNNER_URL?.trim()
  ) {
    return true;
  }
  return expectedFileSize > 15 * 1024 * 1024;
}

function getProcessExcelRunnerBase(): string {
  const explicit = process.env.PROCESS_EXCEL_RUNNER_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) return `https://${railwayDomain}/v1`;
  return getBackendApiUrl();
}

function getProcessExcelContinuationUrl(): string {
  const runnerBase = getProcessExcelRunnerBase();
  if (
    runnerBase.includes("railway.app") ||
    Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    Boolean(process.env.PROCESS_EXCEL_RUNNER_URL?.trim())
  ) {
    return `${runnerBase}/internal/excel/run-import`;
  }
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return `${explicit}/api/process-excel`;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}/api/process-excel`;
  return "http://localhost:3000/api/process-excel";
}

async function scheduleImportContinuation(
  supabaseAdmin: any,
  payload: ImportContinuationPayload
): Promise<void> {
  const url = getProcessExcelContinuationUrl();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.INTERNAL_PROCESS_EXCEL_SECRET?.trim();
  if (secret) headers["x-internal-process-excel"] = secret;
  const body = JSON.stringify({
    connectionId: payload.connectionId,
    dataTableId: payload.dataTableId,
    parseMode: payload.parseMode,
    selectedSheet: payload.selectedSheet,
    continuation: true,
  });

  try {
    await supabaseAdmin
      .from("data_tables")
      .update({
        import_status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.dataTableId);
  } catch (e) {
    console.warn("[process-excel] No se pudo marcar processing antes de continuar:", e);
  }

  const runContinuation = () => {
    void fetch(url, { method: "POST", headers, body })
      .then(async (res) => {
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          console.error("[process-excel] Falló encadenar continuación:", res.status, txt);
          await supabaseAdmin
            .from("data_tables")
            .update({
              import_status: "failed",
              error_message: `No se pudo reanudar la importación en segundo plano (HTTP ${res.status}). Configurá NEXT_PUBLIC_SITE_URL en .env.local (ej. http://localhost:3000) e INTERNAL_PROCESS_EXCEL_SECRET si usás continuaciones protegidas. ${txt.slice(0, 200)}`,
            })
            .eq("id", payload.dataTableId);
        }
      })
      .catch(async (e) => {
        console.error("[process-excel] scheduleImportContinuation:", e);
        await supabaseAdmin
          .from("data_tables")
          .update({
            import_status: "failed",
            error_message:
              "Error de red al encadenar la importación. Revisá NEXT_PUBLIC_SITE_URL en .env.local.",
          })
          .eq("id", payload.dataTableId);
      });
  };

  // Evita deadlock en dev: no llamar al mismo worker de Next mientras aún corre el chunk actual.
  setImmediate(runContinuation);
}

const getExtensionFromPath = (filePath: string) =>
  path.extname(filePath || "").replace(".", "").toLowerCase();

const parseImportCursor = (columns: unknown): ImportCursor | null => {
  if (!columns || typeof columns !== "object" || Array.isArray(columns)) return null;
  const raw = (columns as Record<string, unknown>)[IMPORT_CURSOR_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const insertedRows = Number((raw as Record<string, unknown>).insertedRows ?? 0);
  const selectedSheetRaw = (raw as Record<string, unknown>).selectedSheet;
  const parseModeRaw = (raw as Record<string, unknown>).parseMode;
  if (!Number.isFinite(insertedRows) || insertedRows < 0) return null;
  const selectedSheet =
    typeof selectedSheetRaw === "string" && selectedSheetRaw.trim() !== ""
      ? selectedSheetRaw
      : null;
  const parseMode: ParseMode =
    parseModeRaw === "strict" || parseModeRaw === "tolerant" || parseModeRaw === "mixed"
      ? parseModeRaw
      : "mixed";

  return {
    insertedRows,
    selectedSheet,
    parseMode,
    updatedAt:
      typeof (raw as Record<string, unknown>).updatedAt === "string"
        ? String((raw as Record<string, unknown>).updatedAt)
        : new Date().toISOString(),
  };
};

const mergeCursorIntoColumns = (
  existingColumns: unknown,
  cursor: ImportCursor
): Record<string, unknown> => {
  const base =
    existingColumns && typeof existingColumns === "object" && !Array.isArray(existingColumns)
      ? { ...(existingColumns as Record<string, unknown>) }
      : {};
  base[IMPORT_CURSOR_KEY] = cursor;
  return base;
};

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

// --- GENERADOR HIBRIDO OPTIMIZADO ---
async function* getRowGenerator(
  source: RowGeneratorSource,
  format: FileFormat,
  selectedSheet?: string,
  selectedSheetIndex?: number,
  allSheets?: boolean
) {
  if (format === "csv") {
    if (source.kind !== "path") throw new Error("CSV requiere archivo en disco.");
    const filePath = source.path;
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
    if (source.kind !== "path") throw new Error("XLS/ODS requiere archivo en disco.");
    const filePath = source.path;
    console.log(`[LOG] Modo: ${format.toUpperCase()} (SheetJS)`);
    const workbook = XLSX.readFile(filePath, { cellDates: true });

    if (allSheets) {
      let isFirstSheet = true;
      for (const name of workbook.SheetNames) {
        const worksheet = workbook.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: null,
          raw: false,
        }) as any[][];
        if (rows.length === 0) continue;
        const startIdx = isFirstSheet ? 0 : 1;
        for (let i = startIdx; i < rows.length; i++) {
          yield Array.isArray(rows[i]) ? rows[i] : [];
        }
        isFirstSheet = false;
      }
      return;
    }

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
    // emit + coerceExcelCellValue: evita precargar sharedStrings (lento en archivos 200MB+).
    sharedStrings: "emit",
    styles: "ignore",
    hyperlinks: "ignore",
  };
  const workbookReader =
    source.kind === "xlsxStream"
      ? new ExcelJS.stream.xlsx.WorkbookReader(source.stream, options)
      : new ExcelJS.stream.xlsx.WorkbookReader(source.path, options);
  const targetSheetIndex = selectedSheetIndex ?? 1;
  let sheetIdx = 0;
  let firstSheetProcessed = false;

  if (allSheets) {
    let isFirstSheet = true;
    for await (const worksheetReader of workbookReader) {
      let isFirstRow = true;
      for await (const row of worksheetReader) {
        if (Array.isArray(row.values)) {
          if (!isFirstSheet && isFirstRow) {
            isFirstRow = false;
            continue;
          }
          isFirstRow = false;
          yield row.values.slice(1);
        }
      }
      isFirstSheet = false;
    }
    return;
  }

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
const IMPORT_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutos para archivos grandes

// --- PROCESAMIENTO EN BACKGROUND ---
async function processDataImport(
  connectionId: string,
  dataTableId: string,
  supabaseAdmin: any,
  dbUrl: string,
  parseMode: ParseMode,
  selectedSheet?: string | null,
  storageOptions?: { cookieHeader?: string | null; internal?: boolean },
  forceReimport?: boolean
) {
  let importSource: RowGeneratorSource | null = null;
  let sql: any = null;
  let terminalStatus = false; // true cuando ya pusimos "completed" o "failed"
  let pendingContinuation: ImportContinuationPayload | null = null;

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
        await markFailed("DATABASE_URL no está configurada. Configurala en .env.local.");
        return;
      }

      const { data: tableState } = await supabaseAdmin
        .from("data_tables")
        .select(
          "import_status, columns, total_rows, physical_table_name, table_name"
        )
        .eq("id", dataTableId)
        .single();
      if (!tableState) {
        await markFailed("No se encontró el estado de importación.");
        return;
      }
      if (tableState.import_status === "completed" && !forceReimport) {
        terminalStatus = true;
        return;
      }

      const physicalTableName =
        (tableState.physical_table_name as string | null | undefined)?.trim() ||
        `import_${connectionId.replaceAll("-", "_")}`;
      if (forceReimport) {
        const useSslReset = !/localhost|127\.0\.0\.1/.test(dbUrl);
        const resetSql = postgres(dbUrl, {
          ...(useSslReset ? { ssl: { rejectUnauthorized: false } } : {}),
          prepare: false,
          max: 1,
        });
        try {
          await resetSql.unsafe(
            `TRUNCATE TABLE data_warehouse.${physicalTableName}`
          );
        } catch (truncateErr: any) {
          const msg = String(truncateErr?.message ?? "");
          if (!msg.includes("does not exist")) {
            console.warn("[WARN] No se pudo truncar tabla en reimport:", truncateErr);
          }
        } finally {
          await resetSql.end();
        }
        const baseColumns =
          tableState.columns &&
          typeof tableState.columns === "object" &&
          !Array.isArray(tableState.columns)
            ? { ...(tableState.columns as Record<string, unknown>) }
            : {};
        delete baseColumns[IMPORT_CURSOR_KEY];
        await supabaseAdmin
          .from("data_tables")
          .update({
            import_status: "processing",
            total_rows: null,
            error_message: null,
            columns: Object.keys(baseColumns).length ? baseColumns : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", dataTableId);
      }
      const resumeCursor = parseImportCursor(
        forceReimport ? null : tableState.columns
      );
      const selectedSheetToUse =
        resumeCursor?.selectedSheet !== null && resumeCursor?.selectedSheet !== undefined
          ? resumeCursor.selectedSheet
          : selectedSheet ?? null;
      const parseModeToUse = resumeCursor?.parseMode || parseMode;
      const resumeInsertedRows = forceReimport
        ? 0
        : Math.max(
            resumeCursor?.insertedRows || 0,
            Number(tableState.total_rows || 0)
          );

      // 1. DESCARGA EFICIENTE -------------------------------------
      await supabaseAdmin
        .from("data_tables")
        .update({ import_status: "downloading_file" })
        .eq("id", dataTableId);

    const { data: connection } = await supabaseAdmin
      .from("connections")
      .select("storage_object_path, original_file_name, config")
      .eq("id", connectionId)
      .single()
      .throwOnError();

    if (!connection.storage_object_path) {
      throw new Error(
        "La conexión no tiene un archivo asociado (storage_object_path es nulo)"
      );
    }
    const storagePath = connection.storage_object_path;
    const expectedFileSize = Number(
      (connection.config as { file_size_bytes?: number } | null)?.file_size_bytes ?? 0
    );
    if (isS3Configured() && expectedFileSize > 0) {
      const storedLen = await getS3ObjectContentLength(storagePath);
      if (storedLen != null) {
        const tolerance = Math.max(4096, Math.floor(expectedFileSize * 0.001));
        if (Math.abs(storedLen - expectedFileSize) > tolerance) {
          throw new StageError(
            "download_stream",
            `El archivo en almacenamiento parece incompleto (${Math.round(storedLen / (1024 * 1024))} MB de ${Math.round(expectedFileSize / (1024 * 1024))} MB esperados). Volvé a subir el Excel.`,
            `stored=${storedLen} expected=${expectedFileSize}`
          );
        }
        console.log(
          `[LOG] Tamaño en R2 verificado: ${storedLen} bytes (~${Math.round(storedLen / (1024 * 1024))} MB)`
        );
      }
    }
    const preferredExtension = getExtensionFromPath(
      connection.original_file_name || storagePath
    );
    const useDirectS3Read =
      isS3Configured() &&
      (storageOptions?.internal === true ||
        Boolean(process.env.RAILWAY_ENVIRONMENT));

    const downloadToTempFile = async (): Promise<string> => {
      if (hasLocalExcelFile(storagePath)) {
        return getLocalExcelAbsolutePath(storagePath);
      }

      let attempts = 0;
      const maxAttempts = 3;
      let tmpPath: string | null = null;

      while (attempts < maxAttempts) {
        try {
          assertNotTimedOut();
          attempts++;
          if (attempts > 1) {
            console.log(
              `[LOG] Reintentando descarga (${attempts}/${maxAttempts})...`
            );
          }

          tmpPath = path.join(
            getImportTempDir(),
            `import-${dataTableId}-${Date.now()}-${attempts}.tmp`
          );

          if (useDirectS3Read) {
            await pipeline(
              await getS3ObjectReadableStream(storagePath),
              fs.createWriteStream(tmpPath)
            );
            return tmpPath;
          }

          const signedUrl = await getPresignedDownloadUrl(storagePath, {
            cookieHeader: storageOptions?.cookieHeader,
            internal: storageOptions?.internal,
          });

          const response = await fetch(signedUrl);
          if (!response.ok || !response.body) {
            throw new Error(`Error descargando archivo: ${response.statusText}`);
          }

          await pipeline(
            Readable.fromWeb(response.body as any),
            fs.createWriteStream(tmpPath)
          );
          return tmpPath;
        } catch (err) {
          if (isEnospcError(err)) {
            throw new StageError(
              "temp_file_access",
              enospcImportMessage(),
              err instanceof Error ? err.message : String(err)
            );
          }
          if (tmpPath && fs.existsSync(tmpPath)) {
            try {
              fs.unlinkSync(tmpPath);
            } catch (_) {}
          }
          console.warn(`[WARN] Falló descarga (intento ${attempts}):`, err);
          if (attempts >= maxAttempts) {
            throw new StageError(
              "temp_file_access",
              "No se pudo descargar el archivo para procesarlo.",
              `[download_stream] ${err instanceof Error ? err.message : String(err)}`
            );
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      throw new StageError(
        "temp_file_access",
        "No se pudo preparar el archivo temporal.",
        "[download_stream] retry_exhausted"
      );
    };

    const downloadToXlsxReadableStream = async (): Promise<Readable> => {
      if (hasLocalExcelFile(storagePath)) {
        return fs.createReadStream(getLocalExcelAbsolutePath(storagePath));
      }

      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
        try {
          assertNotTimedOut();
          attempts++;
          if (attempts > 1) {
            console.log(
              `[LOG] Reintentando descarga stream xlsx (${attempts}/${maxAttempts})...`
            );
          }
          if (useDirectS3Read) {
            return getS3ObjectReadableStream(storagePath);
          }

          const signedUrl = await getPresignedDownloadUrl(storagePath, {
            cookieHeader: storageOptions?.cookieHeader,
            internal: storageOptions?.internal,
          });
          const response = await fetch(signedUrl);
          if (!response.ok || !response.body) {
            throw new Error(`Error descargando archivo: ${response.statusText}`);
          }
          return Readable.fromWeb(response.body as any);
        } catch (err) {
          if (isEnospcError(err)) {
            throw new StageError(
              "download_stream",
              enospcImportMessage(),
              err instanceof Error ? err.message : String(err)
            );
          }
          console.warn(`[WARN] Falló descarga stream (intento ${attempts}):`, err);
          if (attempts >= maxAttempts) {
            throw new StageError(
              "download_stream",
              "No se pudo descargar el archivo para procesarlo.",
              `[xlsx_stream] ${err instanceof Error ? err.message : String(err)}`
            );
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      throw new StageError(
        "download_stream",
        "No se pudo iniciar la lectura del Excel.",
        "[xlsx_stream] retry_exhausted"
      );
    };

    const preWarnings: string[] = [];
    if (selectedSheetToUse === "__ALL__") {
      throw new Error(
        "La importación de todas las hojas debe orquestarse desde runProcessExcelImport."
      );
    }
    const isAllSheets = false;
    const extLower = (preferredExtension || "").toLowerCase();
    const isXlsxLike = extLower === "xlsx" || extLower === "xlsm";
    const useLocalXlsxCopy = isXlsxLike && shouldUseLocalXlsxCopy(expectedFileSize);

    if (useLocalXlsxCopy) {
      console.log(
        `[LOG] Archivo xlsx grande (~${Math.round((expectedFileSize || 0) / (1024 * 1024))} MB): descarga a disco local antes de parsear.`
      );
      importSource = { kind: "path", path: await downloadToTempFile() };
    } else if (isXlsxLike) {
      importSource = {
        kind: "xlsxStream",
        stream: await downloadToXlsxReadableStream(),
      };
    } else {
      importSource = { kind: "path", path: await downloadToTempFile() };
    }
    // -----------------------------------------------------------------------

    // 2. CONEXIÓN DB
    const useSsl = !/localhost|127\.0\.0\.1/.test(dbUrl);
    sql = postgres(dbUrl, {
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
      prepare: false,
      max: 1,
      connect_timeout: 20,
    });

    // 3. PROCESAMIENTO STREAMING
    await supabaseAdmin
      .from("data_tables")
      .update({ import_status: "reading_workbook" })
      .eq("id", dataTableId);

    const tableName = physicalTableName;
    let headers: string[] = [];
    let headersSanitized: string[] = [];
    let inferredTypes: string[] = [];
    let buffer: any[][] = [];
    let isTableCreated = resumeInsertedRows > 0;
    let hasMarkedInserting = false;
    let rowCount = 0;
    let sourceDataRowsProcessed = 0;
    let insertedRows = resumeInsertedRows;
    let lastReportedInsertedRows = resumeInsertedRows;
    let lastCursorSaveRows = resumeInsertedRows;
    let currentBatchSize = INSERT_BATCH_SIZE;

    const ensureImportReadable = async () => {
      if (!importSource) {
        throw new StageError(
          "temp_file_access",
          "El origen de importación no está inicializado."
        );
      }
      if (importSource.kind === "xlsxStream") {
        return;
      }
      try {
        await fs.promises.access(importSource.path, fs.constants.R_OK);
      } catch {
        try {
          if (fs.existsSync(importSource.path)) {
            fs.unlinkSync(importSource.path);
          }
        } catch (_) {}
        importSource = { kind: "path", path: await downloadToTempFile() };
        try {
          await fs.promises.access(importSource.path, fs.constants.R_OK);
        } catch (err2) {
          throw new StageError(
            "temp_file_access",
            "Cannot access file en /tmp para iniciar el parser.",
            err2 instanceof Error ? err2.message : String(err2)
          );
        }
      }
    };
    const warnings: string[] = [...preWarnings];
    await ensureImportReadable();
    assertNotTimedOut();
    const pathForFormat =
      importSource!.kind === "path"
        ? importSource.path
        : `stream.${preferredExtension || "xlsx"}`;
    const fileFormat = detectFileFormat(pathForFormat, preferredExtension);
    let finalSelectedSheet = isAllSheets ? undefined : (selectedSheetToUse || undefined);
    let finalSelectedSheetIndex: number | undefined = undefined;

    if (!isAllSheets && fileFormat !== "csv") {
      const isStreamingExcel = fileFormat === "xlsx" || fileFormat === "xlsm";
      let sheetNames: string[] = [];
      let canResolveByMetadata = true;

      if (isStreamingExcel) {
        if (finalSelectedSheet) {
          warnings.push(
            `No se pudo garantizar la hoja "${finalSelectedSheet}" en modo streaming; se utilizará la primera hoja disponible.`
          );
        }
        finalSelectedSheet = undefined;
        finalSelectedSheetIndex = 1;
        canResolveByMetadata = false;
      } else {
        if (importSource!.kind !== "path") {
          throw new StageError(
            "temp_file_access",
            "Se esperaba copia local del archivo para leer las hojas (.xls/.ods)."
          );
        }
        try {
          sheetNames = getSheetNamesFromWorkbook(importSource.path);
        } catch (err) {
          await ensureImportReadable();
          try {
            sheetNames = getSheetNamesFromWorkbook(importSource.path);
          } catch (err2) {
            throw new StageError(
              "temp_file_access",
              "No se pudo leer el workbook desde /tmp.",
              err2 instanceof Error ? err2.message : String(err2)
            );
          }
        }
      }

      if (canResolveByMetadata) {
        const selection = resolveSheetSelection(
          sheetNames,
          finalSelectedSheet,
          parseModeToUse,
          warnings
        );
        finalSelectedSheet = selection.sheetName;
        finalSelectedSheetIndex = selection.sheetIndex;
      }
    } else if (!isAllSheets) {
      finalSelectedSheet = "CSV";
    }

    let rowGenerator = getRowGenerator(
      importSource!,
      fileFormat,
      finalSelectedSheet,
      finalSelectedSheetIndex,
      isAllSheets
    );

    const wallStart = Date.now();
    const chunkWallMs = getChunkWallMs();

    const maybeBreakForVercelChunk = async () => {
      if (chunkWallMs <= 0) return;
      const insertedThisRun = insertedRows - resumeInsertedRows;
      if (insertedThisRun < Math.max(currentBatchSize, 1)) return;
      if (Date.now() - wallStart < chunkWallMs) return;
      while (isTableCreated && buffer.length > 0) {
        const chunk = buffer.splice(0, Math.min(buffer.length, currentBatchSize));
        await insertBatch(sql, tableName, headersSanitized, chunk);
        insertedRows += chunk.length;
      }
      try {
        await supabaseAdmin
          .from("data_tables")
          .update({
            import_status: "inserting_rows",
            total_rows: insertedRows,
            columns: mergeCursorIntoColumns(tableState.columns, {
              insertedRows,
              selectedSheet: selectedSheetToUse,
              parseMode: parseModeToUse,
              updatedAt: new Date().toISOString(),
            }),
            updated_at: new Date().toISOString(),
          })
          .eq("id", dataTableId);
      } catch (e) {
        console.warn("[WARN] No se pudo guardar cursor antes de chunk:", e);
      }
      throw new ImportChunkBoundaryError({
        connectionId,
        dataTableId,
        parseMode: parseModeToUse,
        selectedSheet: selectedSheetToUse,
      });
    };

    let generatorRetried = false;
    const consumeRows = async () => {
      for await (const values of rowGenerator) {
        assertNotTimedOut();
        if (!values || values.length === 0) continue;
        if (values.every((v: any) => v === null || v === "" || v === undefined))
          continue;

        if (rowCount === 0) {
          headers = values.map((value, index) => normalizeHeaderLabel(value, index));
          headersSanitized = buildUniqueSanitizedHeaders(values);

          const numCols = headers.length;
          if (numCols > 0) {
            const maxSafeParams = 60000;
            const calculatedBatch = Math.floor(maxSafeParams / numCols);
            currentBatchSize = Math.min(INSERT_BATCH_SIZE, calculatedBatch);
            console.log(
              `[LOG] Batch Size ajustado a: ${currentBatchSize} filas (Columnas: ${numCols})`
            );
          }

          try {
            await supabaseAdmin
              .from("data_tables")
              .update({ import_status: "creating_table" })
              .eq("id", dataTableId);
          } catch (_) {}

          rowCount++;
          continue;
        }

        if (values.length !== headers.length) {
          if (parseModeToUse === "strict") {
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

        sourceDataRowsProcessed++;
        if (sourceDataRowsProcessed <= resumeInsertedRows) {
          rowCount++;
          continue;
        }

        if (!hasMarkedInserting) {
          hasMarkedInserting = true;
          try {
            await supabaseAdmin
              .from("data_tables")
              .update({ import_status: "inserting_rows" })
              .eq("id", dataTableId);
          } catch (progressError) {
            console.warn("[WARN] Error actualizando estado a inserting_rows:", progressError);
          }
        }

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
            .update({ import_status: "inserting_rows" })
            .eq("id", dataTableId);
        }

        if (isTableCreated && buffer.length >= currentBatchSize) {
          while (buffer.length >= currentBatchSize) {
            const chunk = buffer.splice(0, currentBatchSize);
            await insertBatch(sql, tableName, headersSanitized, chunk);
            insertedRows += chunk.length;
            await maybeBreakForVercelChunk();

            if (insertedRows - lastReportedInsertedRows >= PROGRESS_UPDATE_INTERVAL) {
              lastReportedInsertedRows = insertedRows;
              console.log(`[PROGRESO] Insertadas: ${insertedRows} filas...`);
              const saveCursor = insertedRows - lastCursorSaveRows >= CURSOR_SAVE_INTERVAL;
              try {
                const updatePayload: Record<string, unknown> = {
                  import_status: "inserting_rows",
                  total_rows: insertedRows,
                  updated_at: new Date().toISOString(),
                };
                if (saveCursor) {
                  updatePayload.columns = mergeCursorIntoColumns(
                    tableState.columns,
                    {
                      insertedRows,
                      selectedSheet: selectedSheetToUse,
                      parseMode: parseModeToUse,
                      updatedAt: new Date().toISOString(),
                    }
                  );
                  lastCursorSaveRows = insertedRows;
                }
                await supabaseAdmin
                  .from("data_tables")
                  .update(updatePayload)
                  .eq("id", dataTableId);
              } catch (progressError) {
                console.warn("[WARN] Error actualizando progreso:", progressError);
              }
            }
          }
        }
        rowCount++;
      }
    };

    try {
      await consumeRows();
    } catch (err) {
      if (err instanceof ImportChunkBoundaryError) {
        pendingContinuation = err.payload;
        terminalStatus = true;
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (
        !generatorRetried &&
        rowCount === 0 &&
        msg.toLowerCase().includes("cannot access file")
      ) {
        generatorRetried = true;
        await ensureImportReadable();
        if (importSource!.kind === "xlsxStream") {
          try {
            importSource.stream.destroy();
          } catch (_) {}
          importSource = {
            kind: "xlsxStream",
            stream: await downloadToXlsxReadableStream(),
          };
        }
        rowGenerator = getRowGenerator(
          importSource!,
          fileFormat,
          finalSelectedSheet,
          finalSelectedSheetIndex,
          isAllSheets
        );
        try {
          await consumeRows();
        } catch (err2) {
          if (err2 instanceof ImportChunkBoundaryError) {
            pendingContinuation = err2.payload;
            terminalStatus = true;
            return;
          }
          throw err2;
        }
      } else {
        if (msg.toLowerCase().includes("cannot access file")) {
          throw new StageError(
            "temp_file_access",
            "No se pudo acceder al archivo temporal durante el parseo.",
            msg
          );
        }
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
        insertedRows += chunk.length;
      }
    }

    if (insertedRows > lastReportedInsertedRows) {
      try {
        await supabaseAdmin
          .from("data_tables")
          .update({ import_status: "inserting_rows", total_rows: insertedRows })
          .eq("id", dataTableId);
      } catch (progressError) {
        console.warn("[WARN] Error actualizando progreso final:", progressError);
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
        physical_schema_name: "data_warehouse",
        physical_table_name: tableName,
        table_name: finalSelectedSheet || tableState.table_name || tableName,
        columns: columnMetadata,
        total_rows: insertedRows,
        error_message: [...preWarnings, ...warnings].length
          ? `Advertencias:\n${[...preWarnings, ...warnings].join("\n")}`
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
        msg = "El schema data_warehouse no existe. Ejecutá las migraciones SQL en migrations/.";
      if (typeof msg === "string" && (msg.includes("ECONNREFUSED") || msg.includes("connection")))
        msg = "No se pudo conectar a la base de datos. Revisá que DATABASE_URL en .env.local sea correcta.";
      if (typeof msg === "string" && (msg.includes("ENOSPC") || msg.includes("no space left on device")))
        msg = enospcImportMessage();
      await markFailed(msg);
    } finally {
      if (importSource?.kind === "path" && fs.existsSync(importSource.path)) {
        try {
          fs.unlinkSync(importSource.path);
        } catch (_) {}
      }
      if (importSource?.kind === "xlsxStream") {
        try {
          importSource.stream.destroy();
        } catch (_) {}
      }
      if (sql) await sql.end();
    }
  };

  try {
    await runImport();
  } catch (e: any) {
    if (e?.message === "TIMEOUT") await markFailed("Timeout (máximo 45 minutos).");
  } finally {
    if (!terminalStatus) {
      await markFailed("Procesamiento interrumpido.");
    }
  }

  if (pendingContinuation) {
    await scheduleImportContinuation(supabaseAdmin, pendingContinuation);
  }
}

export type ProcessExcelImportInput = {
  connectionId: string;
  dataTableId: string;
  parseMode: ParseMode;
  selectedSheet: string | null;
  continuation?: boolean;
  forceReimport?: boolean;
  cookieHeader?: string | null;
};

async function runAllSheetsExcelImport(
  input: ProcessExcelImportInput,
  sheetNames: string[],
  supabaseAdmin: ReturnType<typeof createImportAdminClient>,
  dbUrl: string,
  useInternalStorage: boolean
): Promise<void> {
  const nonEmptySheets = sheetNames.filter(Boolean);
  if (nonEmptySheets.length === 0) {
    throw new Error("El archivo no contiene hojas legibles.");
  }

  if (nonEmptySheets.length === 1) {
    if (!input.continuation) {
      await supabaseAdmin
        .from("data_tables")
        .update({ import_status: "processing" })
        .eq("id", input.dataTableId);
    }
    await processDataImport(
      input.connectionId,
      input.dataTableId,
      supabaseAdmin,
      dbUrl,
      input.parseMode,
      nonEmptySheets[0],
      {
        cookieHeader: input.cookieHeader,
        internal: useInternalStorage,
      },
      Boolean(input.forceReimport)
    );
    return;
  }

  const mappings = await ensureDataTablesForSheets(
    supabaseAdmin,
    input.connectionId,
    nonEmptySheets,
    input.dataTableId
  );

  await supabaseAdmin
    .from("connections")
    .update({ connection_tables: excelConnectionTableKeys(mappings) })
    .eq("id", input.connectionId);

  const sheetWarnings: string[] = [];
  let completedCount = 0;

  for (const mapping of mappings) {
    if (!input.continuation) {
      await supabaseAdmin
        .from("data_tables")
        .update({ import_status: "processing", error_message: null })
        .eq("id", mapping.dataTableId);
    }

    try {
      await processDataImport(
        input.connectionId,
        mapping.dataTableId,
        supabaseAdmin,
        dbUrl,
        input.parseMode,
        mapping.sheetName,
        {
          cookieHeader: input.cookieHeader,
          internal: useInternalStorage,
        },
        Boolean(input.forceReimport)
      );

      const { data: row } = await supabaseAdmin
        .from("data_tables")
        .select("import_status, error_message")
        .eq("id", mapping.dataTableId)
        .single();

      if (row?.import_status === "completed") {
        completedCount++;
        if (row.error_message) {
          sheetWarnings.push(`[${mapping.sheetName}] ${row.error_message}`);
        }
      } else if (row?.import_status === "failed") {
        sheetWarnings.push(
          `[${mapping.sheetName}] ${row.error_message ?? "Error desconocido"}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sheetWarnings.push(`[${mapping.sheetName}] ${msg}`);
    }
  }

  if (completedCount === mappings.length) {
    const summary =
      sheetWarnings.length > 0
        ? `Importadas ${completedCount} hojas con advertencias:\n${sheetWarnings.join("\n")}`
        : `Importadas ${completedCount} hojas correctamente.`;
    await supabaseAdmin
      .from("data_tables")
      .update({
        import_status: "completed",
        error_message: sheetWarnings.length ? summary : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.dataTableId);
  } else if (completedCount > 0) {
    await supabaseAdmin
      .from("data_tables")
      .update({
        import_status: "failed",
        error_message: `Se importaron ${completedCount} de ${mappings.length} hojas.\n${sheetWarnings.join("\n")}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.dataTableId);
  } else {
    await supabaseAdmin
      .from("data_tables")
      .update({
        import_status: "failed",
        error_message:
          sheetWarnings.join("\n") || "No se pudo importar ninguna hoja.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.dataTableId);
  }
}

/** Ejecuta la importación Excel (usar en Railway o local; no en Vercel serverless). */
export async function runProcessExcelImport(input: ProcessExcelImportInput): Promise<void> {
  const dbUrl = getImportDbUrl();
  if (!dbUrl?.trim()) {
    throw new Error("DATABASE_URL no está configurada.");
  }

  const supabaseAdmin = createImportAdminClient();
  const useInternalStorage =
    Boolean(input.continuation) ||
    !input.cookieHeader ||
    Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    Boolean(process.env.PROCESS_EXCEL_RUNNER_URL?.trim());

  let selectedSheet = input.selectedSheet;

  if (!input.continuation) {
    const { data: connection } = await supabaseAdmin
      .from("connections")
      .select("storage_object_path, original_file_name")
      .eq("id", input.connectionId)
      .single();

    if (connection?.storage_object_path) {
      const buffer = await loadWorkbookBufferForConnection(
        connection.storage_object_path as string,
        (connection.original_file_name as string | null) ?? null,
        {
          cookieHeader: input.cookieHeader,
          internal: useInternalStorage,
        }
      );
      const sheetNames = listSheetNamesFromBuffer(
        buffer,
        connection.storage_object_path as string,
        (connection.original_file_name as string | null) ?? null
      );

      const wantsAllSheets =
        selectedSheet === "__ALL__" ||
        (selectedSheet == null && sheetNames.length > 1);

      if (wantsAllSheets && sheetNames.length > 1) {
        await runAllSheetsExcelImport(
          input,
          sheetNames,
          supabaseAdmin,
          dbUrl,
          useInternalStorage
        );
        return;
      }

      if (!selectedSheet && sheetNames.length === 1) {
        selectedSheet = sheetNames[0];
      }
    }
  }

  if (!input.continuation) {
    const { error } = await supabaseAdmin
      .from("data_tables")
      .update({ import_status: "processing" })
      .eq("id", input.dataTableId);
    if (error) {
      throw new Error(`No se pudo encolar la importación: ${error.message}`);
    }
  }

  await processDataImport(
    input.connectionId,
    input.dataTableId,
    supabaseAdmin,
    dbUrl,
    input.parseMode,
    selectedSheet,
    {
      cookieHeader: input.cookieHeader,
      internal: useInternalStorage,
    },
    Boolean(input.forceReimport)
  );
}

async function insertBatch(
  sql: any,
  table: string,
  headers: string[],
  rows: any[][]
) {
  if (!rows.length) return;

  const data = rows.map((r: any) => {
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
