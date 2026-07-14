import type { Request } from "express";
import { DashboardService } from "./dashboard.service";
export declare class DashboardController {
    private readonly dashboard;
    constructor(dashboard: DashboardService);
    aggregateData(body: Record<string, unknown>, req: Request & {
        user: {
            sub: string;
        };
    }): Promise<unknown>;
    distinctValues(body: {
        tableName: string;
        field: string;
        limit?: number;
        transform?: string;
    }, req: Request & {
        user: {
            sub: string;
        };
    }): Promise<unknown[] | {
        error: string;
    }>;
    rawData(body: {
        tableName: string;
        limit?: number;
        offset?: number;
    }, req: Request & {
        user: {
            sub: string;
        };
    }): Promise<unknown[] | {
        error: string;
    }>;
}
