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
exports.buildSheetPhysicalTableName = buildSheetPhysicalTableName;
exports.loadWorkbookBufferForConnection = loadWorkbookBufferForConnection;
exports.listSheetNamesFromBuffer = listSheetNamesFromBuffer;
exports.listSheetNamesForConnection = listSheetNamesForConnection;
exports.resolveImportSheetSelection = resolveImportSheetSelection;
exports.ensureDataTablesForSheets = ensureDataTablesForSheets;
exports.excelConnectionTableKeys = excelConnectionTableKeys;
const XLSX = __importStar(require("xlsx"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const excel_upload_storage_1 = require("../storage/excel-upload-storage");
const s3_excel_storage_1 = require("../storage/s3-excel-storage");
function buildSheetPhysicalTableName(connectionId, sheetName, sheetIndex, usedNames) {
    const base = `import_${connectionId.replace(/-/g, "_")}`;
    if (sheetIndex === 0 && !usedNames?.has(base)) {
        usedNames?.add(base);
        return base;
    }
    const slug = sheetName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 18) || `sheet_${sheetIndex + 1}`;
    let candidate = `${base}_${slug}`;
    if (usedNames) {
        let n = 2;
        while (usedNames.has(candidate)) {
            candidate = `${base}_${slug}_${n}`.slice(0, 63);
            n++;
        }
        usedNames.add(candidate);
    }
    return candidate.length > 63 ? candidate.slice(0, 63) : candidate;
}
async function loadWorkbookBufferForConnection(storagePath, originalFileName, options) {
    if ((0, excel_upload_storage_1.hasLocalExcelFile)(storagePath)) {
        return fs_1.default.promises.readFile((0, excel_upload_storage_1.getLocalExcelAbsolutePath)(storagePath));
    }
    const url = await (0, s3_excel_storage_1.getPresignedDownloadUrl)(storagePath, {
        cookieHeader: options?.cookieHeader,
        internal: options?.internal,
    });
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Error descargando archivo: ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
}
function listSheetNamesFromBuffer(buffer, storagePath, originalFileName) {
    const ext = path_1.default
        .extname(originalFileName || storagePath || "")
        .replace(".", "")
        .toLowerCase();
    if (ext === "csv")
        return ["Sheet1"];
    const workbook = XLSX.read(buffer, { type: "buffer", bookSheets: true });
    return (workbook.SheetNames ?? []).filter(Boolean);
}
async function listSheetNamesForConnection(connectionId, supabaseAdmin, options) {
    const { data: connection } = await supabaseAdmin
        .from("connections")
        .select("storage_object_path, original_file_name")
        .eq("id", connectionId)
        .single();
    const storagePath = String(connection?.storage_object_path ?? "").trim();
    if (!storagePath) {
        throw new Error("No se encontró el archivo Excel en almacenamiento.");
    }
    const originalFileName = connection?.original_file_name ?? null;
    const buffer = await loadWorkbookBufferForConnection(storagePath, originalFileName, options);
    const sheetNames = listSheetNamesFromBuffer(buffer, storagePath, originalFileName);
    return { sheetNames, storagePath, originalFileName };
}
async function resolveImportSheetSelection(connectionId, selectedSheet, supabaseAdmin, options) {
    const token = selectedSheet?.trim() || null;
    const { sheetNames } = await listSheetNamesForConnection(connectionId, supabaseAdmin, options);
    if (sheetNames.length === 0) {
        throw new Error("El archivo no contiene hojas legibles.");
    }
    const wantsAllSheets = token === "__ALL__" || (token == null && sheetNames.length > 1);
    if (wantsAllSheets && sheetNames.length > 1) {
        return { mode: "all", sheetNames };
    }
    if (token && token !== "__ALL__" && sheetNames.includes(token)) {
        return { mode: "single", sheetName: token, sheetNames };
    }
    if (token && token !== "__ALL__" && !sheetNames.includes(token)) {
        throw new Error(`La hoja "${token}" no existe en el archivo.`);
    }
    return { mode: "single", sheetName: sheetNames[0], sheetNames };
}
async function ensureDataTablesForSheets(supabaseAdmin, connectionId, sheetNames, initialDataTableId) {
    const { data: existingRows } = await supabaseAdmin
        .from("data_tables")
        .select("id, table_name, physical_table_name")
        .eq("connection_id", connectionId);
    const existingBySheet = new Map();
    for (const row of (existingRows ?? [])) {
        if (row.table_name) {
            existingBySheet.set(row.table_name, row);
        }
    }
    const usedPhysical = new Set((existingRows ?? [])
        .map((r) => r.physical_table_name)
        .filter((n) => Boolean(n)));
    const mappings = [];
    for (let i = 0; i < sheetNames.length; i++) {
        const sheetName = sheetNames[i];
        const physicalTableName = buildSheetPhysicalTableName(connectionId, sheetName, i, usedPhysical);
        if (i === 0) {
            await supabaseAdmin
                .from("data_tables")
                .update({
                table_name: sheetName,
                schema_name: "etl_output",
                physical_schema_name: "data_warehouse",
                physical_table_name: physicalTableName,
                import_status: "pending",
            })
                .eq("id", initialDataTableId);
            mappings.push({
                sheetName,
                dataTableId: initialDataTableId,
                physicalTableName,
            });
            continue;
        }
        const existing = existingBySheet.get(sheetName);
        if (existing) {
            mappings.push({
                sheetName,
                dataTableId: existing.id,
                physicalTableName: existing.physical_table_name?.trim() || physicalTableName,
            });
            continue;
        }
        const { data: inserted, error } = await supabaseAdmin
            .from("data_tables")
            .insert({
            connection_id: connectionId,
            table_name: sheetName,
            schema_name: "etl_output",
            import_status: "pending",
            physical_schema_name: "data_warehouse",
            physical_table_name: physicalTableName,
        })
            .select("id")
            .single();
        if (error || !inserted?.id) {
            throw new Error(`No se pudo crear tabla para la hoja "${sheetName}": ${error?.message ?? "error desconocido"}`);
        }
        mappings.push({
            sheetName,
            dataTableId: inserted.id,
            physicalTableName,
        });
    }
    return mappings;
}
function excelConnectionTableKeys(mappings) {
    return mappings.map((m) => `data_warehouse.${m.physicalTableName}`);
}
//# sourceMappingURL=excel-sheet-tables.js.map