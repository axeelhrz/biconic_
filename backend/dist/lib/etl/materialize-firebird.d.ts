import { Client as PgClient } from "pg";
import { type DateFilterSpec } from "../sql/helpers";
type FirebirdConn = {
    id?: string | number;
    type?: string;
    db_host?: string | null;
    db_port?: number | null;
    db_name?: string | null;
    db_user?: string | null;
    db_password?: string | null;
    db_password_encrypted?: string | null;
    db_password_secret_id?: string | null;
};
export type MaterializeResult = {
    qualifiedTable: string;
    rowCount: number;
};
export declare function materializeFirebirdTable(conn: FirebirdConn, table: string, columns: string[] | undefined, dateFilter: DateFilterSpec | undefined, pgUrl: string, targetSchema: string, targetTable: string, signal?: {
    aborted: boolean;
}, sharedPgClient?: PgClient): Promise<MaterializeResult>;
export declare function materializePostgresTable(conn: {
    db_host?: string | null;
    db_port?: number | null;
    db_name?: string | null;
    db_user?: string | null;
    db_password?: string | null;
    db_password_encrypted?: string | null;
    db_password_secret_id?: string | null;
    type?: string;
}, table: string, columns: string[] | undefined, dateFilter: DateFilterSpec | undefined, pgUrl: string, targetSchema: string, targetTable: string, sharedPgClient?: PgClient): Promise<MaterializeResult>;
export declare function cleanupTempTables(pgUrl: string, tables: string[]): Promise<void>;
export {};
