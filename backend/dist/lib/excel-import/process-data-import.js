"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runProcessExcelImport = runProcessExcelImport;
const exceljs_1 = __importDefault(require("exceljs"));
const postgres_1 = __importDefault(require("postgres"));
const backend_config_1 = require("../api/backend-config");
const import_admin_client_1 = require("./import-admin-client");
const excel_upload_storage_1 = require("../storage/excel-upload-storage");
const s3_excel_storage_1 = require("../storage/s3-excel-storage");
const stream_1 = require("stream");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const promises_1 = require("stream/promises");
const node_dns_1 = __importDefault(require("node:dns"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const XLSX = __importStar(require("xlsx"));
const excel_sheet_tables_1 = require("./excel-sheet-tables");
node_dns_1.default.setDefaultResultOrder("ipv4first");
function getImportTempDir() {
    const custom = process.env.IMPORT_TMP_DIR?.trim();
    if (custom)
        return custom;
    return os_1.default.tmpdir();
}
function isEnospcError(err) {
    if (!err || typeof err !== "object")
        return false;
    const e = err;
    return e.code === "ENOSPC" || String(e.message ?? "").includes("ENOSPC");
}
function enospcImportMessage() {
    const onVercel = Boolean(process.env.VERCEL);
    return ("No hay espacio suficiente en disco para procesar el archivo. " +
        (onVercel
            ? "En Vercel el disco temporal es muy pequeño (~512 MB): usá solo la primera hoja en archivos grandes o procesá en un entorno con más espacio (Railway/local). "
            : "Liberá espacio en el servidor o configurá IMPORT_TMP_DIR en .env apuntando a una carpeta con más espacio. ") +
        "Los .xlsx/.xlsm se procesan por streaming; evitá importar todas las hojas en archivos muy grandes.");
}
const INSERT_BATCH_SIZE = 2000;
const SAMPLE_SIZE = 1000;
const PROGRESS_UPDATE_INTERVAL = 2000;
const MAX_WARNINGS = 20;
const CURSOR_SAVE_INTERVAL = 10000;
const IMPORT_CURSOR_KEY = "__import_cursor_v1";
const SHEETJS_XLSX_MAX_BYTES = 120 * 1024 * 1024;
const DEBUG_INGEST_URL = "http://127.0.0.1:7710/ingest/20cf47c8-0473-4ba0-9564-fc0b0bf73d37";
const DEBUG_SESSION_ID = "ccff04";
function extractTextFromExcelValue(value) {
    if (value === null || value === undefined)
        return null;
    if (value instanceof Date)
        return value.toISOString().split("T")[0];
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed || trimmed === "[object Object]")
            return null;
        return trimmed;
    }
    if (typeof value === "object") {
        const cell = value;
        if (typeof cell.text === "string" && cell.text.trim()) {
            return cell.text.trim();
        }
        if (cell.result !== null && cell.result !== undefined && cell.result !== "") {
            return String(cell.result).trim();
        }
        if (Array.isArray(cell.richText)) {
            const text = cell.richText
                .map((part) => part && typeof part === "object" && "text" in part
                ? String(part.text ?? "")
                : "")
                .join("")
                .trim();
            if (text)
                return text;
        }
        if (typeof cell.hyperlink === "string" && cell.hyperlink.trim()) {
            return cell.hyperlink.trim();
        }
    }
    return null;
}
function normalizeHeaderLabel(value, index) {
    return extractTextFromExcelValue(value) ?? `column_${index + 1}`;
}
const slugifyColumnBase = (name) => {
    const slug = name
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .toLowerCase()
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
    return slug || "unnamed_column";
};
const sanitizeColumnName = (name) => `"${slugifyColumnBase(name)}"`;
function looksLikeGenericExcelHeaders(headers) {
    if (headers.length === 0)
        return false;
    const genericCount = headers.filter((header) => /^column_\d+$/i.test(header.trim())).length;
    return genericCount >= Math.max(1, Math.ceil(headers.length * 0.5));
}
function readExcelHeaderLabelsFromPath(filePath, selectedSheet, selectedSheetIndex) {
    try {
        const workbook = XLSX.readFile(filePath, { cellDates: true, sheetRows: 1 });
        const sheetName = selectedSheet && workbook.SheetNames.includes(selectedSheet)
            ? selectedSheet
            : workbook.SheetNames[Math.max(0, (selectedSheetIndex ?? 1) - 1)] ??
                workbook.SheetNames[0];
        if (!sheetName || !workbook.Sheets[sheetName])
            return null;
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
            header: 1,
            defval: null,
            raw: false,
        });
        const firstRow = rows[0];
        if (!Array.isArray(firstRow))
            return null;
        const labels = firstRow.map((value, index) => normalizeHeaderLabel(value, index));
        return looksLikeGenericExcelHeaders(labels) ? null : labels;
    }
    catch {
        return null;
    }
}
function buildUniqueSanitizedHeaders(values) {
    const labels = values.map((value, index) => normalizeHeaderLabel(value, index));
    const seen = new Map();
    return labels.map((label) => {
        const base = slugifyColumnBase(label);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const unique = count === 0 ? base : `${base}_${count + 1}`;
        return `"${unique}"`;
    });
}
function coerceExcelCellValue(val) {
    if (val === null || val === undefined)
        return null;
    if (val instanceof Date)
        return val.toISOString().split("T")[0];
    if (typeof val === "boolean" || typeof val === "number")
        return val;
    if (typeof val === "object") {
        const cell = val;
        if ("sharedString" in cell)
            return null;
        const text = extractTextFromExcelValue(val);
        return text;
    }
    if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? null : trimmed;
    }
    return val;
}
const cleanValue = (val) => coerceExcelCellValue(val);
const isInteger = (v) => /^-?\d+$/.test(v);
const isFloat = (v) => /^-?\d+(\.\d+)?$/.test(v) && !isInteger(v);
const isBoolean = (v) => /^(true|false|t|f|1|0)$/i.test(v);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
function inferColumnTypes(rows, headerCount) {
    if (rows.length === 0)
        return Array(headerCount).fill("TEXT");
    const columnChecks = Array(headerCount)
        .fill(0)
        .map(() => ({ isBool: true, isDate: true, isInt: true, isFloat: true }));
    for (const row of rows) {
        for (let i = 0; i < headerCount; i++) {
            const coerced = coerceExcelCellValue(row[i]);
            if (coerced === null || coerced === undefined)
                continue;
            const strValue = String(coerced);
            if (strValue.trim() === "")
                continue;
            const checks = columnChecks[i];
            if (checks.isBool && !isBoolean(strValue))
                checks.isBool = false;
            if (checks.isDate && !isDate(strValue))
                checks.isDate = false;
            if (checks.isInt && !isInteger(strValue))
                checks.isInt = false;
            if (checks.isFloat && !isFloat(strValue) && !isInteger(strValue))
                checks.isFloat = false;
        }
    }
    return columnChecks.map((checks) => {
        if (checks.isBool)
            return "BOOLEAN";
        if (checks.isDate)
            return "DATE";
        if (checks.isInt)
            return "BIGINT";
        if (checks.isFloat)
            return "FLOAT";
        return "TEXT";
    });
}
function detectSeparator(filePath) {
    const buffer = Buffer.alloc(4096);
    let fd;
    try {
        fd = fs_1.default.openSync(filePath, "r");
        fs_1.default.readSync(fd, buffer, 0, 4096, 0);
    }
    catch (e) {
        return ",";
    }
    finally {
        if (fd !== undefined)
            fs_1.default.closeSync(fd);
    }
    const text = buffer.toString("utf-8");
    const firstLine = text.split(/\r?\n/)[0];
    if (!firstLine)
        return ",";
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const pipeCount = (firstLine.match(/\|/g) || []).length;
    const max = Math.max(commaCount, semiCount, tabCount, pipeCount);
    if (max === 0)
        return ",";
    if (max === semiCount)
        return ";";
    if (max === tabCount)
        return "\t";
    if (max === pipeCount)
        return "|";
    return ",";
}
class StageError extends Error {
    constructor(stage, message, details) {
        super(message);
        this.name = "StageError";
        this.stage = stage;
        this.details = details;
    }
}
class ImportChunkBoundaryError extends Error {
    constructor(payload) {
        super("IMPORT_CHUNK_BOUNDARY");
        this.name = "ImportChunkBoundaryError";
        this.payload = payload;
    }
}
function getChunkWallMs() {
    const raw = process.env.PROCESS_EXCEL_CHUNK_MS?.trim();
    if (raw === "0")
        return 0;
    if (raw && Number.isFinite(Number(raw)) && Number(raw) > 0) {
        return Math.floor(Number(raw));
    }
    const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT) ||
        Boolean(process.env.RAILWAY_PUBLIC_DOMAIN) ||
        Boolean(process.env.PROCESS_EXCEL_RUNNER_URL?.trim());
    if (onRailway || !process.env.VERCEL)
        return 0;
    return 180_000;
}
function shouldUseLocalXlsxCopy(expectedFileSize) {
    if (process.env.VERCEL)
        return false;
    if (process.env.RAILWAY_ENVIRONMENT ||
        process.env.RAILWAY_PUBLIC_DOMAIN ||
        process.env.PROCESS_EXCEL_RUNNER_URL?.trim()) {
        return true;
    }
    return expectedFileSize > 15 * 1024 * 1024;
}
function getProcessExcelRunnerBase() {
    const explicit = process.env.PROCESS_EXCEL_RUNNER_URL?.trim().replace(/\/$/, "");
    if (explicit)
        return explicit;
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
    if (railwayDomain)
        return `https://${railwayDomain}/v1`;
    return (0, backend_config_1.getBackendApiUrl)();
}
function getProcessExcelContinuationUrl() {
    const runnerBase = getProcessExcelRunnerBase();
    if (runnerBase.includes("railway.app") ||
        Boolean(process.env.RAILWAY_ENVIRONMENT) ||
        Boolean(process.env.PROCESS_EXCEL_RUNNER_URL?.trim())) {
        return `${runnerBase}/internal/excel/run-import`;
    }
    const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
    if (explicit)
        return `${explicit}/api/process-excel`;
    const vercel = process.env.VERCEL_URL?.trim();
    if (vercel)
        return `https://${vercel}/api/process-excel`;
    return "http://localhost:3000/api/process-excel";
}
async function scheduleImportContinuation(supabaseAdmin, payload) {
    const url = getProcessExcelContinuationUrl();
    const headers = { "Content-Type": "application/json" };
    const secret = process.env.INTERNAL_PROCESS_EXCEL_SECRET?.trim();
    if (secret)
        headers["x-internal-process-excel"] = secret;
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
    }
    catch (e) {
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
                error_message: "Error de red al encadenar la importación. Revisá NEXT_PUBLIC_SITE_URL en .env.local.",
            })
                .eq("id", payload.dataTableId);
        });
    };
    setImmediate(runContinuation);
}
const getExtensionFromPath = (filePath) => path_1.default.extname(filePath || "").replace(".", "").toLowerCase();
const parseImportCursor = (columns) => {
    if (!columns || typeof columns !== "object" || Array.isArray(columns))
        return null;
    const raw = columns[IMPORT_CURSOR_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
    const insertedRows = Number(raw.insertedRows ?? 0);
    const selectedSheetRaw = raw.selectedSheet;
    const parseModeRaw = raw.parseMode;
    if (!Number.isFinite(insertedRows) || insertedRows < 0)
        return null;
    const selectedSheet = typeof selectedSheetRaw === "string" && selectedSheetRaw.trim() !== ""
        ? selectedSheetRaw
        : null;
    const parseMode = parseModeRaw === "strict" || parseModeRaw === "tolerant" || parseModeRaw === "mixed"
        ? parseModeRaw
        : "mixed";
    return {
        insertedRows,
        selectedSheet,
        parseMode,
        updatedAt: typeof raw.updatedAt === "string"
            ? String(raw.updatedAt)
            : new Date().toISOString(),
    };
};
const mergeCursorIntoColumns = (existingColumns, cursor) => {
    const base = existingColumns && typeof existingColumns === "object" && !Array.isArray(existingColumns)
        ? { ...existingColumns }
        : {};
    base[IMPORT_CURSOR_KEY] = cursor;
    return base;
};
const detectFileFormat = (filePath, preferredExtension) => {
    const extension = (preferredExtension || getExtensionFromPath(filePath)).toLowerCase();
    if (extension === "csv")
        return "csv";
    if (extension === "xls")
        return "xls";
    if (extension === "ods")
        return "ods";
    if (extension === "xlsm")
        return "xlsm";
    if (extension === "xlsx")
        return "xlsx";
    const buffer = Buffer.alloc(4);
    const fd = fs_1.default.openSync(filePath, "r");
    try {
        fs_1.default.readSync(fd, buffer, 0, 4, 0);
    }
    finally {
        fs_1.default.closeSync(fd);
    }
    const signature = buffer.toString("hex");
    if (signature === "504b0304")
        return "xlsx";
    if (signature.startsWith("d0cf11e0"))
        return "xls";
    return "csv";
};
const getSheetNamesFromWorkbook = (filePath) => {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    return Array.isArray(workbook.SheetNames)
        ? workbook.SheetNames.filter(Boolean)
        : [];
};
const resolveSheetSelection = (sheetNames, requestedSheet, parseMode, warnings) => {
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
    const relaxedIndex = sheetNames.findIndex((sheet) => sheet.trim().toLowerCase() === normalizedRequested);
    if (relaxedIndex >= 0) {
        const resolvedName = sheetNames[relaxedIndex];
        if (requestedSheet !== resolvedName) {
            warnings.push(`La hoja "${requestedSheet}" no coincidía exactamente. Se utilizó "${resolvedName}".`);
        }
        return { sheetName: resolvedName, sheetIndex: relaxedIndex + 1 };
    }
    if (parseMode === "strict") {
        throw new Error(`La hoja seleccionada "${requestedSheet}" no existe en el archivo (modo: ${parseMode}). Hojas detectadas: ${sheetNames.join(", ")}.`);
    }
    warnings.push(`La hoja "${requestedSheet}" no existe. Se utilizó "${sheetNames[0]}".`);
    return { sheetName: sheetNames[0], sheetIndex: 1 };
};
async function* getRowGenerator(source, format, selectedSheet, selectedSheetIndex, allSheets) {
    if (format === "csv") {
        if (source.kind !== "path")
            throw new Error("CSV requiere archivo en disco.");
        const filePath = source.path;
        const separator = detectSeparator(filePath);
        console.log(`[LOG] Modo: CSV Stream. Separador detectado: [ ${separator === "\t" ? "TAB" : separator} ]`);
        const stream = fs_1.default.createReadStream(filePath).pipe((0, csv_parser_1.default)({
            headers: false,
            separator,
        }));
        for await (const row of stream) {
            yield Object.values(row);
        }
        return;
    }
    if (format === "xls" || format === "ods") {
        if (source.kind !== "path")
            throw new Error("XLS/ODS requiere archivo en disco.");
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
                });
                if (rows.length === 0)
                    continue;
                const startIdx = isFirstSheet ? 0 : 1;
                for (let i = startIdx; i < rows.length; i++) {
                    yield Array.isArray(rows[i]) ? rows[i] : [];
                }
                isFirstSheet = false;
            }
            return;
        }
        const sheetName = selectedSheet && workbook.SheetNames.includes(selectedSheet)
            ? selectedSheet
            : workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: null,
            raw: false,
        });
        for (const row of rows) {
            yield Array.isArray(row) ? row : [];
        }
        return;
    }
    if ((format === "xlsx" || format === "xlsm") &&
        source.kind === "path") {
        const filePath = source.path;
        let fileSize = 0;
        try {
            fileSize = fs_1.default.statSync(filePath).size;
        }
        catch {
            fileSize = 0;
        }
        if (fileSize > 0 && fileSize <= SHEETJS_XLSX_MAX_BYTES) {
            console.log(`[LOG] Modo: ${format.toUpperCase()} (SheetJS, ~${Math.round(fileSize / (1024 * 1024))} MB)`);
            const workbook = XLSX.readFile(filePath, { cellDates: true });
            const sheetName = selectedSheet && workbook.SheetNames.includes(selectedSheet)
                ? selectedSheet
                : workbook.SheetNames[Math.max(0, (selectedSheetIndex ?? 1) - 1)] ?? workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                defval: null,
                raw: false,
            });
            for (const row of rows) {
                yield Array.isArray(row) ? row : [];
            }
            return;
        }
    }
    console.log("[LOG] Modo: XLSX/XLSM Stream (ExcelJS)");
    const options = {
        entries: "emit",
        sharedStrings: "cache",
        styles: "ignore",
        hyperlinks: "ignore",
    };
    const workbookReader = source.kind === "xlsxStream"
        ? new exceljs_1.default.stream.xlsx.WorkbookReader(source.stream, options)
        : new exceljs_1.default.stream.xlsx.WorkbookReader(source.path, options);
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
        if (!shouldProcess)
            continue;
        firstSheetProcessed = true;
        for await (const row of worksheetReader) {
            if (Array.isArray(row.values)) {
                yield row.values.slice(1);
            }
        }
        if (!selectedSheet)
            break;
    }
    if (selectedSheet && !firstSheetProcessed) {
        throw new Error(`La hoja "${selectedSheet}" no existe en el archivo.`);
    }
}
const IMPORT_TIMEOUT_MS = 45 * 60 * 1000;
async function processDataImport(connectionId, dataTableId, supabaseAdmin, dbUrl, parseMode, selectedSheet, storageOptions, forceReimport) {
    let importSource = null;
    let sql = null;
    let terminalStatus = false;
    let pendingContinuation = null;
    const markFailed = async (message) => {
        if (terminalStatus)
            return;
        terminalStatus = true;
        try {
            await supabaseAdmin
                .from("data_tables")
                .update({ import_status: "failed", error_message: message })
                .eq("id", dataTableId);
        }
        catch (_) { }
    };
    console.log(`[BACKGROUND] Iniciando importación para Data Table: ${dataTableId}`);
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
                .select("import_status, columns, total_rows, physical_table_name, table_name")
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
            const physicalTableName = tableState.physical_table_name?.trim() ||
                `import_${connectionId.replaceAll("-", "_")}`;
            if (forceReimport) {
                const useSslReset = !/localhost|127\.0\.0\.1/.test(dbUrl);
                const resetSql = (0, postgres_1.default)(dbUrl, {
                    ...(useSslReset ? { ssl: { rejectUnauthorized: false } } : {}),
                    prepare: false,
                    max: 1,
                });
                try {
                    await resetSql.unsafe(`TRUNCATE TABLE data_warehouse.${physicalTableName}`);
                }
                catch (truncateErr) {
                    const msg = String(truncateErr?.message ?? "");
                    if (!msg.includes("does not exist")) {
                        console.warn("[WARN] No se pudo truncar tabla en reimport:", truncateErr);
                    }
                }
                finally {
                    await resetSql.end();
                }
                const baseColumns = tableState.columns &&
                    typeof tableState.columns === "object" &&
                    !Array.isArray(tableState.columns)
                    ? { ...tableState.columns }
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
            const resumeCursor = parseImportCursor(forceReimport ? null : tableState.columns);
            let selectedSheetToUse = resumeCursor?.selectedSheet !== null && resumeCursor?.selectedSheet !== undefined
                ? resumeCursor.selectedSheet
                : selectedSheet ?? null;
            const parseModeToUse = resumeCursor?.parseMode || parseMode;
            const resumeInsertedRows = forceReimport
                ? 0
                : Math.max(resumeCursor?.insertedRows || 0, Number(tableState.total_rows || 0));
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
                throw new Error("La conexión no tiene un archivo asociado (storage_object_path es nulo)");
            }
            const storagePath = connection.storage_object_path;
            const expectedFileSize = Number(connection.config?.file_size_bytes ?? 0);
            if ((0, s3_excel_storage_1.isS3Configured)() && expectedFileSize > 0) {
                const storedLen = await (0, s3_excel_storage_1.getS3ObjectContentLength)(storagePath);
                if (storedLen != null) {
                    const tolerance = Math.max(4096, Math.floor(expectedFileSize * 0.001));
                    if (Math.abs(storedLen - expectedFileSize) > tolerance) {
                        throw new StageError("download_stream", `El archivo en almacenamiento parece incompleto (${Math.round(storedLen / (1024 * 1024))} MB de ${Math.round(expectedFileSize / (1024 * 1024))} MB esperados). Volvé a subir el Excel.`, `stored=${storedLen} expected=${expectedFileSize}`);
                    }
                    console.log(`[LOG] Tamaño en R2 verificado: ${storedLen} bytes (~${Math.round(storedLen / (1024 * 1024))} MB)`);
                }
            }
            const preferredExtension = getExtensionFromPath(connection.original_file_name || storagePath);
            const useDirectS3Read = (0, s3_excel_storage_1.isS3Configured)() &&
                (storageOptions?.internal === true ||
                    Boolean(process.env.RAILWAY_ENVIRONMENT));
            const downloadToTempFile = async () => {
                if ((0, excel_upload_storage_1.hasLocalExcelFile)(storagePath)) {
                    return (0, excel_upload_storage_1.getLocalExcelAbsolutePath)(storagePath);
                }
                let attempts = 0;
                const maxAttempts = 3;
                let tmpPath = null;
                while (attempts < maxAttempts) {
                    try {
                        assertNotTimedOut();
                        attempts++;
                        if (attempts > 1) {
                            console.log(`[LOG] Reintentando descarga (${attempts}/${maxAttempts})...`);
                        }
                        tmpPath = path_1.default.join(getImportTempDir(), `import-${dataTableId}-${Date.now()}-${attempts}.tmp`);
                        if (useDirectS3Read) {
                            await (0, promises_1.pipeline)(await (0, s3_excel_storage_1.getS3ObjectReadableStream)(storagePath), fs_1.default.createWriteStream(tmpPath));
                            return tmpPath;
                        }
                        const signedUrl = await (0, s3_excel_storage_1.getPresignedDownloadUrl)(storagePath, {
                            cookieHeader: storageOptions?.cookieHeader,
                            internal: storageOptions?.internal,
                        });
                        const response = await fetch(signedUrl);
                        if (!response.ok || !response.body) {
                            throw new Error(`Error descargando archivo: ${response.statusText}`);
                        }
                        await (0, promises_1.pipeline)(stream_1.Readable.fromWeb(response.body), fs_1.default.createWriteStream(tmpPath));
                        return tmpPath;
                    }
                    catch (err) {
                        if (isEnospcError(err)) {
                            throw new StageError("temp_file_access", enospcImportMessage(), err instanceof Error ? err.message : String(err));
                        }
                        if (tmpPath && fs_1.default.existsSync(tmpPath)) {
                            try {
                                fs_1.default.unlinkSync(tmpPath);
                            }
                            catch (_) { }
                        }
                        console.warn(`[WARN] Falló descarga (intento ${attempts}):`, err);
                        if (attempts >= maxAttempts) {
                            throw new StageError("temp_file_access", "No se pudo descargar el archivo para procesarlo.", `[download_stream] ${err instanceof Error ? err.message : String(err)}`);
                        }
                        await new Promise((r) => setTimeout(r, 2000));
                    }
                }
                throw new StageError("temp_file_access", "No se pudo preparar el archivo temporal.", "[download_stream] retry_exhausted");
            };
            const downloadToXlsxReadableStream = async () => {
                if ((0, excel_upload_storage_1.hasLocalExcelFile)(storagePath)) {
                    return fs_1.default.createReadStream((0, excel_upload_storage_1.getLocalExcelAbsolutePath)(storagePath));
                }
                let attempts = 0;
                const maxAttempts = 3;
                while (attempts < maxAttempts) {
                    try {
                        assertNotTimedOut();
                        attempts++;
                        if (attempts > 1) {
                            console.log(`[LOG] Reintentando descarga stream xlsx (${attempts}/${maxAttempts})...`);
                        }
                        if (useDirectS3Read) {
                            return (0, s3_excel_storage_1.getS3ObjectReadableStream)(storagePath);
                        }
                        const signedUrl = await (0, s3_excel_storage_1.getPresignedDownloadUrl)(storagePath, {
                            cookieHeader: storageOptions?.cookieHeader,
                            internal: storageOptions?.internal,
                        });
                        const response = await fetch(signedUrl);
                        if (!response.ok || !response.body) {
                            throw new Error(`Error descargando archivo: ${response.statusText}`);
                        }
                        return stream_1.Readable.fromWeb(response.body);
                    }
                    catch (err) {
                        if (isEnospcError(err)) {
                            throw new StageError("download_stream", enospcImportMessage(), err instanceof Error ? err.message : String(err));
                        }
                        console.warn(`[WARN] Falló descarga stream (intento ${attempts}):`, err);
                        if (attempts >= maxAttempts) {
                            throw new StageError("download_stream", "No se pudo descargar el archivo para procesarlo.", `[xlsx_stream] ${err instanceof Error ? err.message : String(err)}`);
                        }
                        await new Promise((r) => setTimeout(r, 2000));
                    }
                }
                throw new StageError("download_stream", "No se pudo iniciar la lectura del Excel.", "[xlsx_stream] retry_exhausted");
            };
            const preWarnings = [];
            if (selectedSheetToUse === "__ALL__") {
                const resolved = await (0, excel_sheet_tables_1.resolveImportSheetSelection)(connectionId, selectedSheetToUse, supabaseAdmin, storageOptions);
                if (resolved.mode === "all") {
                    throw new Error("La importación de todas las hojas debe orquestarse desde runProcessExcelImport.");
                }
                selectedSheetToUse = resolved.sheetName;
            }
            const isAllSheets = false;
            const extLower = (preferredExtension || "").toLowerCase();
            const isXlsxLike = extLower === "xlsx" || extLower === "xlsm";
            const useLocalXlsxCopy = isXlsxLike && shouldUseLocalXlsxCopy(expectedFileSize);
            if (useLocalXlsxCopy) {
                console.log(`[LOG] Archivo xlsx grande (~${Math.round((expectedFileSize || 0) / (1024 * 1024))} MB): descarga a disco local antes de parsear.`);
                importSource = { kind: "path", path: await downloadToTempFile() };
            }
            else if (isXlsxLike) {
                importSource = {
                    kind: "xlsxStream",
                    stream: await downloadToXlsxReadableStream(),
                };
            }
            else {
                importSource = { kind: "path", path: await downloadToTempFile() };
            }
            const useSsl = !/localhost|127\.0\.0\.1/.test(dbUrl);
            sql = (0, postgres_1.default)(dbUrl, {
                ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
                prepare: false,
                max: 1,
                connect_timeout: 20,
            });
            await supabaseAdmin
                .from("data_tables")
                .update({ import_status: "reading_workbook" })
                .eq("id", dataTableId);
            const tableName = physicalTableName;
            let headers = [];
            let headersSanitized = [];
            let inferredTypes = [];
            let buffer = [];
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
                    throw new StageError("temp_file_access", "El origen de importación no está inicializado.");
                }
                if (importSource.kind === "xlsxStream") {
                    return;
                }
                try {
                    await fs_1.default.promises.access(importSource.path, fs_1.default.constants.R_OK);
                }
                catch {
                    try {
                        if (fs_1.default.existsSync(importSource.path)) {
                            fs_1.default.unlinkSync(importSource.path);
                        }
                    }
                    catch (_) { }
                    importSource = { kind: "path", path: await downloadToTempFile() };
                    try {
                        await fs_1.default.promises.access(importSource.path, fs_1.default.constants.R_OK);
                    }
                    catch (err2) {
                        throw new StageError("temp_file_access", "Cannot access file en /tmp para iniciar el parser.", err2 instanceof Error ? err2.message : String(err2));
                    }
                }
            };
            const warnings = [...preWarnings];
            await ensureImportReadable();
            assertNotTimedOut();
            const pathForFormat = importSource.kind === "path"
                ? importSource.path
                : `stream.${preferredExtension || "xlsx"}`;
            const fileFormat = detectFileFormat(pathForFormat, preferredExtension);
            let finalSelectedSheet = isAllSheets ? undefined : (selectedSheetToUse || undefined);
            let finalSelectedSheetIndex = undefined;
            if (!isAllSheets && fileFormat !== "csv") {
                const isStreamingExcel = fileFormat === "xlsx" || fileFormat === "xlsm";
                let sheetNames = [];
                let canResolveByMetadata = true;
                if (isStreamingExcel) {
                    if (finalSelectedSheet) {
                        warnings.push(`No se pudo garantizar la hoja "${finalSelectedSheet}" en modo streaming; se utilizará la primera hoja disponible.`);
                    }
                    finalSelectedSheet = undefined;
                    finalSelectedSheetIndex = 1;
                    canResolveByMetadata = false;
                }
                else {
                    if (importSource.kind !== "path") {
                        throw new StageError("temp_file_access", "Se esperaba copia local del archivo para leer las hojas (.xls/.ods).");
                    }
                    try {
                        sheetNames = getSheetNamesFromWorkbook(importSource.path);
                    }
                    catch (err) {
                        await ensureImportReadable();
                        try {
                            sheetNames = getSheetNamesFromWorkbook(importSource.path);
                        }
                        catch (err2) {
                            throw new StageError("temp_file_access", "No se pudo leer el workbook desde /tmp.", err2 instanceof Error ? err2.message : String(err2));
                        }
                    }
                }
                if (canResolveByMetadata) {
                    const selection = resolveSheetSelection(sheetNames, finalSelectedSheet, parseModeToUse, warnings);
                    finalSelectedSheet = selection.sheetName;
                    finalSelectedSheetIndex = selection.sheetIndex;
                }
            }
            else if (!isAllSheets) {
                finalSelectedSheet = "CSV";
            }
            let rowGenerator = getRowGenerator(importSource, fileFormat, finalSelectedSheet, finalSelectedSheetIndex, isAllSheets);
            const wallStart = Date.now();
            const chunkWallMs = getChunkWallMs();
            const maybeBreakForVercelChunk = async () => {
                if (chunkWallMs <= 0)
                    return;
                const insertedThisRun = insertedRows - resumeInsertedRows;
                if (insertedThisRun < Math.max(currentBatchSize, 1))
                    return;
                if (Date.now() - wallStart < chunkWallMs)
                    return;
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
                }
                catch (e) {
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
                    if (!values || values.length === 0)
                        continue;
                    if (values.every((v) => v === null || v === "" || v === undefined))
                        continue;
                    if (rowCount === 0) {
                        headers = values.map((value, index) => normalizeHeaderLabel(value, index));
                        if (looksLikeGenericExcelHeaders(headers) &&
                            importSource?.kind === "path" &&
                            (fileFormat === "xlsx" || fileFormat === "xlsm")) {
                            const recovered = readExcelHeaderLabelsFromPath(importSource.path, finalSelectedSheet, finalSelectedSheetIndex);
                            if (recovered?.length) {
                                console.log(`[LOG] Cabeceras recuperadas con SheetJS (${recovered.length} columnas).`);
                                headers = recovered;
                            }
                        }
                        headersSanitized = buildUniqueSanitizedHeaders(headers);
                        const numCols = headers.length;
                        if (numCols > 0) {
                            const maxSafeParams = 60000;
                            const calculatedBatch = Math.floor(maxSafeParams / numCols);
                            currentBatchSize = Math.min(INSERT_BATCH_SIZE, calculatedBatch);
                            console.log(`[LOG] Batch Size ajustado a: ${currentBatchSize} filas (Columnas: ${numCols})`);
                        }
                        try {
                            await supabaseAdmin
                                .from("data_tables")
                                .update({ import_status: "creating_table" })
                                .eq("id", dataTableId);
                        }
                        catch (_) { }
                        rowCount++;
                        continue;
                    }
                    if (values.length !== headers.length) {
                        if (parseModeToUse === "strict") {
                            throw new Error(`La fila ${rowCount + 1} tiene ${values.length} columnas y se esperaban ${headers.length}.`);
                        }
                        if (warnings.length < MAX_WARNINGS) {
                            warnings.push(`Fila ${rowCount + 1} normalizada por diferencia de columnas (${values.length}/${headers.length}).`);
                        }
                    }
                    const normalizedValues = values.length > headers.length
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
                        }
                        catch (progressError) {
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
                        await sql.unsafe(`CREATE TABLE IF NOT EXISTS data_warehouse.${tableName} (_import_id BIGSERIAL PRIMARY KEY, ${cols})`);
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
                                    const updatePayload = {
                                        import_status: "inserting_rows",
                                        total_rows: insertedRows,
                                        updated_at: new Date().toISOString(),
                                    };
                                    if (saveCursor) {
                                        updatePayload.columns = mergeCursorIntoColumns(tableState.columns, {
                                            insertedRows,
                                            selectedSheet: selectedSheetToUse,
                                            parseMode: parseModeToUse,
                                            updatedAt: new Date().toISOString(),
                                        });
                                        lastCursorSaveRows = insertedRows;
                                    }
                                    await supabaseAdmin
                                        .from("data_tables")
                                        .update(updatePayload)
                                        .eq("id", dataTableId);
                                }
                                catch (progressError) {
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
            }
            catch (err) {
                if (err instanceof ImportChunkBoundaryError) {
                    pendingContinuation = err.payload;
                    terminalStatus = true;
                    return;
                }
                const msg = err instanceof Error ? err.message : String(err);
                if (!generatorRetried &&
                    rowCount === 0 &&
                    msg.toLowerCase().includes("cannot access file")) {
                    generatorRetried = true;
                    await ensureImportReadable();
                    if (importSource.kind === "xlsxStream") {
                        try {
                            importSource.stream.destroy();
                        }
                        catch (_) { }
                        importSource = {
                            kind: "xlsxStream",
                            stream: await downloadToXlsxReadableStream(),
                        };
                    }
                    rowGenerator = getRowGenerator(importSource, fileFormat, finalSelectedSheet, finalSelectedSheetIndex, isAllSheets);
                    try {
                        await consumeRows();
                    }
                    catch (err2) {
                        if (err2 instanceof ImportChunkBoundaryError) {
                            pendingContinuation = err2.payload;
                            terminalStatus = true;
                            return;
                        }
                        throw err2;
                    }
                }
                else {
                    if (msg.toLowerCase().includes("cannot access file")) {
                        throw new StageError("temp_file_access", "No se pudo acceder al archivo temporal durante el parseo.", msg);
                    }
                    throw err;
                }
            }
            if (!isTableCreated && buffer.length > 0) {
                inferredTypes = inferColumnTypes(buffer, headers.length);
                const cols = headersSanitized
                    .map((h, i) => `${h} ${inferredTypes[i] || "TEXT"}`)
                    .join(", ");
                await sql.unsafe(`CREATE TABLE IF NOT EXISTS data_warehouse.${tableName} (_import_id BIGSERIAL PRIMARY KEY, ${cols})`);
            }
            if (buffer.length > 0) {
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
                }
                catch (progressError) {
                    console.warn("[WARN] Error actualizando progreso final:", progressError);
                }
            }
            const columnMetadata = headers.map((h, i) => ({
                name: headersSanitized[i].replaceAll('"', ""),
                original_name: h,
                type: inferredTypes[i] || "TEXT",
            }));
            if (terminalStatus)
                return;
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
        }
        catch (error) {
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
        }
        finally {
            if (importSource?.kind === "path" && fs_1.default.existsSync(importSource.path)) {
                try {
                    fs_1.default.unlinkSync(importSource.path);
                }
                catch (_) { }
            }
            if (importSource?.kind === "xlsxStream") {
                try {
                    importSource.stream.destroy();
                }
                catch (_) { }
            }
            if (sql)
                await sql.end();
        }
    };
    try {
        await runImport();
    }
    catch (e) {
        if (e?.message === "TIMEOUT")
            await markFailed("Timeout (máximo 45 minutos).");
    }
    finally {
        if (!terminalStatus) {
            await markFailed("Procesamiento interrumpido.");
        }
    }
    if (pendingContinuation) {
        await scheduleImportContinuation(supabaseAdmin, pendingContinuation);
    }
}
async function runAllSheetsExcelImport(input, sheetNames, supabaseAdmin, dbUrl, useInternalStorage) {
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
        await processDataImport(input.connectionId, input.dataTableId, supabaseAdmin, dbUrl, input.parseMode, nonEmptySheets[0], {
            cookieHeader: input.cookieHeader,
            internal: useInternalStorage,
        }, Boolean(input.forceReimport));
        return;
    }
    const mappings = await (0, excel_sheet_tables_1.ensureDataTablesForSheets)(supabaseAdmin, input.connectionId, nonEmptySheets, input.dataTableId);
    await supabaseAdmin
        .from("connections")
        .update({ connection_tables: (0, excel_sheet_tables_1.excelConnectionTableKeys)(mappings) })
        .eq("id", input.connectionId);
    const sheetWarnings = [];
    let completedCount = 0;
    for (const mapping of mappings) {
        if (!input.continuation) {
            await supabaseAdmin
                .from("data_tables")
                .update({ import_status: "processing", error_message: null })
                .eq("id", mapping.dataTableId);
        }
        try {
            await processDataImport(input.connectionId, mapping.dataTableId, supabaseAdmin, dbUrl, input.parseMode, mapping.sheetName, {
                cookieHeader: input.cookieHeader,
                internal: useInternalStorage,
            }, Boolean(input.forceReimport));
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
            }
            else if (row?.import_status === "failed") {
                sheetWarnings.push(`[${mapping.sheetName}] ${row.error_message ?? "Error desconocido"}`);
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            sheetWarnings.push(`[${mapping.sheetName}] ${msg}`);
        }
    }
    if (completedCount === mappings.length) {
        const summary = sheetWarnings.length > 0
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
    }
    else if (completedCount > 0) {
        await supabaseAdmin
            .from("data_tables")
            .update({
            import_status: "failed",
            error_message: `Se importaron ${completedCount} de ${mappings.length} hojas.\n${sheetWarnings.join("\n")}`,
            updated_at: new Date().toISOString(),
        })
            .eq("id", input.dataTableId);
    }
    else {
        await supabaseAdmin
            .from("data_tables")
            .update({
            import_status: "failed",
            error_message: sheetWarnings.join("\n") || "No se pudo importar ninguna hoja.",
            updated_at: new Date().toISOString(),
        })
            .eq("id", input.dataTableId);
    }
}
async function runProcessExcelImport(input) {
    const dbUrl = (0, import_admin_client_1.getImportDbUrl)();
    if (!dbUrl?.trim()) {
        throw new Error("DATABASE_URL no está configurada.");
    }
    const supabaseAdmin = (0, import_admin_client_1.createImportAdminClient)();
    const useInternalStorage = Boolean(input.continuation) ||
        !input.cookieHeader ||
        Boolean(process.env.RAILWAY_ENVIRONMENT) ||
        Boolean(process.env.PROCESS_EXCEL_RUNNER_URL?.trim());
    let selectedSheet = input.selectedSheet;
    const sheetResolution = await (0, excel_sheet_tables_1.resolveImportSheetSelection)(input.connectionId, selectedSheet, supabaseAdmin, {
        cookieHeader: input.cookieHeader,
        internal: useInternalStorage,
    });
    if (sheetResolution.mode === "all") {
        await runAllSheetsExcelImport(input, sheetResolution.sheetNames, supabaseAdmin, dbUrl, useInternalStorage);
        return;
    }
    selectedSheet = sheetResolution.sheetName;
    if (!input.continuation) {
        const { error } = await supabaseAdmin
            .from("data_tables")
            .update({ import_status: "processing" })
            .eq("id", input.dataTableId);
        if (error) {
            throw new Error(`No se pudo encolar la importación: ${error.message}`);
        }
    }
    await processDataImport(input.connectionId, input.dataTableId, supabaseAdmin, dbUrl, input.parseMode, selectedSheet, {
        cookieHeader: input.cookieHeader,
        internal: useInternalStorage,
    }, Boolean(input.forceReimport));
}
async function insertBatch(sql, table, headers, rows) {
    if (!rows.length)
        return;
    const data = rows.map((r) => {
        const obj = {};
        headers.forEach((h, i) => (obj[h.replaceAll('"', "")] = cleanValue(r[i])));
        return obj;
    });
    try {
        await sql `INSERT INTO data_warehouse.${sql(table)} ${sql(data)}`;
    }
    catch (e) {
        console.warn("[WARN] Falló insert masivo, reintentando...", e.message);
        try {
            await sql `INSERT INTO data_warehouse.${sql(table)} ${sql(data)}`;
        }
        catch (retryError) {
            console.error("[ERROR INSERT] Perdida de datos en lote:", retryError);
            throw retryError;
        }
    }
}
//# sourceMappingURL=process-data-import.js.map