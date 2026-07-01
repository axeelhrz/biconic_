import { type PostgresServiceQuery } from "../supabase/service-admin-client";
export declare function getImportDbUrl(): string;
export type ImportAdminClient = {
    from: (table: string) => PostgresServiceQuery;
    storage: {
        from: (_bucket: string) => {
            createSignedUrl: (storagePath: string, _expiresIn: number) => Promise<{
                data: {
                    signedUrl: string;
                } | null;
                error: {
                    message: string;
                } | null;
            }>;
        };
    };
    _sql?: import("postgres").Sql;
};
export declare function createImportAdminClient(): ImportAdminClient;
export declare function closeImportAdminClient(client: ImportAdminClient): Promise<void>;
