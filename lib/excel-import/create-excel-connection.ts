import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
import {
  buildExcelStoragePath,
  saveExcelFileLocal,
} from "@/lib/storage/excel-upload-storage";
import { readFileSync } from "fs";
import { join } from "path";

function getSql() {
  return postgres(getInternalDbUrl(), { max: 3 });
}

async function ensureExcelSchema(sql: ReturnType<typeof postgres>) {
  for (const file of ["003_excel_import.sql", "004_data_warehouse.sql"]) {
    try {
      const sqlText = readFileSync(join(process.cwd(), "migrations", file), "utf8");
      await sql.unsafe(sqlText);
    } catch {
      /* migration opcional */
    }
  }
}

export async function createExcelConnectionWithFile(input: {
  file: File;
  connectionName: string;
  clientId: string;
  userId: string;
}): Promise<{ connectionId: string; dataTableId: string; storagePath: string }> {
  const buffer = Buffer.from(await input.file.arrayBuffer());
  return createExcelConnectionWithBuffer({
    buffer,
    fileName: input.file.name,
    connectionName: input.connectionName,
    clientId: input.clientId,
    userId: input.userId,
  });
}

export async function createExcelConnectionRecord(input: {
  connectionName: string;
  clientId: string;
  userId: string;
  fileName: string;
  storagePath?: string;
  fileSizeBytes?: number;
}): Promise<{ connectionId: string; dataTableId: string; storagePath: string }> {
  const sql = getSql();
  try {
    await ensureExcelSchema(sql);

    const fileExt = input.fileName.split(".").pop()?.toLowerCase() ?? "xlsx";
    const storagePath =
      input.storagePath ?? buildExcelStoragePath(input.userId, fileExt);

    const [connection] = await sql<{ id: string }[]>`
      INSERT INTO public.connections (
        name, user_id, client_id, type, storage_object_path, original_file_name, config
      )
      VALUES (
        ${input.connectionName},
        ${input.userId},
        ${input.clientId},
        'excel_file',
        ${storagePath},
        ${input.fileName},
        ${input.fileSizeBytes && input.fileSizeBytes > 0
          ? sql.json({ file_size_bytes: input.fileSizeBytes })
          : null}
      )
      RETURNING id
    `;

    if (!connection) throw new Error("No se pudo crear la conexión");

    const physicalTable = `import_${connection.id.replace(/-/g, "_")}`;

    const [dataTable] = await sql<{ id: string }[]>`
      INSERT INTO public.data_tables (
        connection_id,
        schema_name,
        table_name,
        import_status,
        physical_schema_name,
        physical_table_name
      )
      VALUES (
        ${connection.id},
        'etl_output',
        ${physicalTable},
        'pending',
        'data_warehouse',
        ${physicalTable}
      )
      RETURNING id
    `;

    if (!dataTable) throw new Error("No se pudo crear data_tables");

    return {
      connectionId: connection.id,
      dataTableId: dataTable.id,
      storagePath,
    };
  } finally {
    await sql.end();
  }
}

export async function createExcelConnectionWithBuffer(input: {
  buffer: Buffer;
  fileName: string;
  connectionName: string;
  clientId: string;
  userId: string;
}): Promise<{ connectionId: string; dataTableId: string; storagePath: string }> {
  const fileExt = input.fileName.split(".").pop()?.toLowerCase() ?? "xlsx";
  const storagePath = buildExcelStoragePath(input.userId, fileExt);
  await saveExcelFileLocal(storagePath, input.buffer);

  return createExcelConnectionRecord({
    connectionName: input.connectionName,
    clientId: input.clientId,
    userId: input.userId,
    fileName: input.fileName,
    storagePath,
  });
}

export async function requireAuthUserId(): Promise<string> {
  const user = await getServerAuthUser();
  if (!user?.id) throw new Error("No autorizado");
  return user.id;
}
