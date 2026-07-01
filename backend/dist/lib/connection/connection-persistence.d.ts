import type postgres from "postgres";
export type ConnectionType = "mysql" | "postgres" | "postgresql" | "firebird" | "excel";
export type ConnectionCredentials = {
    host: string;
    database: string;
    user: string;
    port: number;
    passwordEncrypted?: string | null;
};
export declare function getConnectionsTableColumns(sql: ReturnType<typeof postgres>): Promise<Set<string>>;
export declare function clearConnectionsSchemaCache(): void;
export type HydratedConnectionRow = Record<string, unknown> & {
    id?: string;
    type?: string;
    db_host: string | null;
    db_name: string | null;
    db_user: string | null;
    db_port: number | null;
    db_password_encrypted: string | null;
    db_password_secret_id: string | null;
};
export declare function hydrateConnectionRow(row: Record<string, unknown>): HydratedConnectionRow;
export declare function readCredentialsFromConnectionRow(row: Record<string, unknown>): ConnectionCredentials & {
    passwordEncrypted: string | null;
};
export declare function readConnectionTablesFromRow(row: Record<string, unknown>): string[] | null;
export declare function buildConnectionInsertRow(columns: Set<string>, base: {
    name: string;
    user_id: string;
    client_id: string | null;
    type: string;
    storage_object_path?: string | null;
    original_file_name?: string | null;
}, creds?: ConnectionCredentials): Record<string, unknown>;
export declare function buildConnectionUpdateRow(columns: Set<string>, patch: {
    name?: string;
    host?: string;
    database?: string;
    user?: string;
    port?: number;
    connection_tables?: string[];
}, existingConfig?: Record<string, unknown> | null): Record<string, unknown>;
