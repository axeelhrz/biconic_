import { DatabaseService } from "../database/database.service";
export declare class ConnectionsService {
    private readonly db;
    constructor(db: DatabaseService);
    listForUser(userId: string, appRole: string): Promise<import("pg").QueryResultRow[]>;
    getById(id: string, userId: string, appRole: string): Promise<import("pg").QueryResultRow>;
    create(userId: string, payload: {
        name: string;
        type: string;
        clientId?: string;
        config?: unknown;
    }): Promise<import("pg").QueryResultRow | null>;
    update(id: string, payload: Record<string, unknown>, userId: string, appRole: string): Promise<import("pg").QueryResultRow | null>;
    executeQuery(connectionId: string, sql: string, userId: string, appRole: string): Promise<{
        data: unknown[] | null;
        error: {
            message: string;
        } | null;
    }>;
}
