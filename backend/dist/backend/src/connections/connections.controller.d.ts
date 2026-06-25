import type { Request } from "express";
import { ConnectionsService } from "./connections.service";
export declare class ConnectionsController {
    private readonly connections;
    constructor(connections: ConnectionsService);
    list(req: Request & {
        user: {
            sub: string;
            app_role?: string;
        };
    }): Promise<import("pg").QueryResultRow[]>;
    get(id: string, req: Request & {
        user: {
            sub: string;
            app_role?: string;
        };
    }): Promise<import("pg").QueryResultRow>;
    create(body: {
        name: string;
        type: string;
        clientId?: string;
        config?: unknown;
    }, req: Request & {
        user: {
            sub: string;
        };
    }): Promise<import("pg").QueryResultRow | null>;
    update(id: string, body: Record<string, unknown>, req: Request & {
        user: {
            sub: string;
            app_role?: string;
        };
    }): Promise<import("pg").QueryResultRow | null>;
    query(id: string, body: {
        sql: string;
    }, req: Request & {
        user: {
            sub: string;
            app_role?: string;
        };
    }): Promise<{
        data: unknown[] | null;
        error: {
            message: string;
        } | null;
    }>;
}
