import { DatabaseService } from "../database/database.service";
export declare class DashboardService {
    private readonly db;
    constructor(db: DatabaseService);
    private buildGeoCacheClient;
    private loadAggregateModules;
    aggregateData(body: Record<string, unknown>, userId?: string): Promise<import("../../../lib/dashboard/aggregateDataHandler").AggregateDataResult>;
    distinctValues(body: {
        tableName: string;
        field: string;
        limit?: number;
        transform?: string;
    }, userId?: string): Promise<{
        status: number;
        data: {
            error: string;
        };
    } | {
        status: number;
        data: unknown[];
    }>;
    rawData(body: {
        tableName: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        status: number;
        data: {
            error: string;
        };
    } | {
        status: number;
        data: unknown[];
    }>;
}
