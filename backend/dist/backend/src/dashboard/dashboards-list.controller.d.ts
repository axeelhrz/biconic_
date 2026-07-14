import type { Request } from "express";
import { DatabaseService } from "../database/database.service";
export declare class DashboardsListController {
    private readonly db;
    constructor(db: DatabaseService);
    list(req: Request & {
        user: {
            sub: string;
            app_role?: string;
        };
    }): Promise<import("pg").QueryResultRow[]>;
}
