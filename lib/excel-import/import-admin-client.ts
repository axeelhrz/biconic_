import {
  createServiceAdminClient,
  getServiceDbUrl,
  type PostgresServiceQuery,
} from "@/lib/supabase/service-admin-client";
import {
  getExcelFileServeUrl,
  hasLocalExcelFile,
} from "@/lib/storage/excel-upload-storage";

export function getImportDbUrl(): string {
  return getServiceDbUrl();
}

export type ImportAdminClient = {
  from: (table: string) => PostgresServiceQuery;
  storage: {
    from: (_bucket: string) => {
      createSignedUrl: (
        storagePath: string,
        _expiresIn: number
      ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    };
  };
  _sql?: import("postgres").Sql;
};

export function createImportAdminClient(): ImportAdminClient {
  const admin = createServiceAdminClient();

  return {
    from(table: string) {
      return admin.from(table);
    },
    storage: {
      from(_bucket: string) {
        return {
          async createSignedUrl(storagePath: string) {
            if (!hasLocalExcelFile(storagePath)) {
              return {
                data: null,
                error: { message: "Archivo no encontrado en almacenamiento local" },
              };
            }
            return {
              data: { signedUrl: getExcelFileServeUrl(storagePath) },
              error: null,
            };
          },
        };
      },
    },
    _sql: admin._sql,
  };
}

export async function closeImportAdminClient(client: ImportAdminClient) {
  if (client._sql) {
    await client._sql.end();
  }
}
