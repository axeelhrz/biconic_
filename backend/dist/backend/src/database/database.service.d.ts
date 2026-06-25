import { OnModuleDestroy } from "@nestjs/common";
import { type QueryResultRow } from "pg";
export declare class DatabaseService implements OnModuleDestroy {
    private readonly pool;
    constructor();
    query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
    queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T | null>;
    executeSql(sqlQuery: string): Promise<{
        data: unknown[] | null;
        error: {
            message: string;
        } | null;
    }>;
    onModuleDestroy(): Promise<void>;
}
