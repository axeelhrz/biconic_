import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import {
  getLocalExcelAbsolutePath,
  hasLocalExcelFile,
} from "@/lib/storage/excel-upload-storage";
import { getPresignedDownloadUrl } from "@/lib/storage/s3-excel-storage";

export function buildSheetPhysicalTableName(
  connectionId: string,
  sheetName: string,
  sheetIndex: number,
  usedNames?: Set<string>
): string {
  const base = `import_${connectionId.replace(/-/g, "_")}`;
  if (sheetIndex === 0 && !usedNames?.has(base)) {
    usedNames?.add(base);
    return base;
  }

  const slug =
    sheetName
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

export type SheetTableMapping = {
  sheetName: string;
  dataTableId: string;
  physicalTableName: string;
};

export async function loadWorkbookBufferForConnection(
  storagePath: string,
  originalFileName: string | null | undefined,
  options?: { cookieHeader?: string | null; internal?: boolean }
): Promise<Buffer> {
  if (hasLocalExcelFile(storagePath)) {
    return fs.promises.readFile(getLocalExcelAbsolutePath(storagePath));
  }

  const url = await getPresignedDownloadUrl(storagePath, {
    cookieHeader: options?.cookieHeader,
    internal: options?.internal,
  });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Error descargando archivo: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export function listSheetNamesFromBuffer(
  buffer: Buffer,
  storagePath: string,
  originalFileName?: string | null
): string[] {
  const ext = path
    .extname(originalFileName || storagePath || "")
    .replace(".", "")
    .toLowerCase();
  if (ext === "csv") return ["Sheet1"];
  const workbook = XLSX.read(buffer, { type: "buffer", bookSheets: true });
  return (workbook.SheetNames ?? []).filter(Boolean);
}

export async function listSheetNamesForConnection(
  connectionId: string,
  supabaseAdmin: { from: (table: string) => unknown },
  options?: { cookieHeader?: string | null; internal?: boolean }
): Promise<{ sheetNames: string[]; storagePath: string; originalFileName: string | null }> {
  const { data: connection } = await (supabaseAdmin as { from: (t: string) => any })
    .from("connections")
    .select("storage_object_path, original_file_name")
    .eq("id", connectionId)
    .single();

  const storagePath = String(connection?.storage_object_path ?? "").trim();
  if (!storagePath) {
    throw new Error("No se encontró el archivo Excel en almacenamiento.");
  }

  const originalFileName = (connection?.original_file_name as string | null) ?? null;
  const buffer = await loadWorkbookBufferForConnection(storagePath, originalFileName, options);
  const sheetNames = listSheetNamesFromBuffer(buffer, storagePath, originalFileName);
  return { sheetNames, storagePath, originalFileName };
}

export type ImportSheetResolution =
  | { mode: "single"; sheetName: string; sheetNames: string[] }
  | { mode: "all"; sheetNames: string[] };

/** Convierte `__ALL__` / null en hoja concreta o importación multi-hoja. */
export async function resolveImportSheetSelection(
  connectionId: string,
  selectedSheet: string | null | undefined,
  supabaseAdmin: { from: (table: string) => unknown },
  options?: { cookieHeader?: string | null; internal?: boolean }
): Promise<ImportSheetResolution> {
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

export async function ensureDataTablesForSheets(
  supabaseAdmin: any,
  connectionId: string,
  sheetNames: string[],
  initialDataTableId: string
): Promise<SheetTableMapping[]> {
  const { data: existingRows } = await supabaseAdmin
    .from("data_tables")
    .select("id, table_name, physical_table_name")
    .eq("connection_id", connectionId);

  const existingBySheet = new Map<
    string,
    { id: string; physical_table_name?: string | null }
  >();
  for (const row of (existingRows ?? []) as {
    id: string;
    table_name?: string | null;
    physical_table_name?: string | null;
  }[]) {
    if (row.table_name) {
      existingBySheet.set(row.table_name, row);
    }
  }

  const usedPhysical = new Set<string>(
    ((existingRows ?? []) as { physical_table_name?: string | null }[])
      .map((r) => r.physical_table_name)
      .filter((n): n is string => Boolean(n))
  );

  const mappings: SheetTableMapping[] = [];

  for (let i = 0; i < sheetNames.length; i++) {
    const sheetName = sheetNames[i];
    const physicalTableName = buildSheetPhysicalTableName(
      connectionId,
      sheetName,
      i,
      usedPhysical
    );

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
        physicalTableName:
          existing.physical_table_name?.trim() || physicalTableName,
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
      throw new Error(
        `No se pudo crear tabla para la hoja "${sheetName}": ${error?.message ?? "error desconocido"}`
      );
    }

    mappings.push({
      sheetName,
      dataTableId: inserted.id,
      physicalTableName,
    });
  }

  return mappings;
}

export function excelConnectionTableKeys(
  mappings: SheetTableMapping[]
): string[] {
  return mappings.map((m) => `data_warehouse.${m.physicalTableName}`);
}
