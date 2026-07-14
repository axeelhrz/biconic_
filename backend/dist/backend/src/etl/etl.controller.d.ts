import type { Request } from "express";
import { Observable } from "rxjs";
import { EtlService } from "./etl.service";
import { DatabaseService } from "../database/database.service";
export declare class EtlController {
    private readonly etl;
    private readonly db;
    constructor(etl: EtlService, db: DatabaseService);
    list(req: Request & {
        user: {
            sub: string;
            app_role?: string;
        };
    }): Promise<import("pg").QueryResultRow[]>;
    run(body: {
        etlId: string;
        userId?: string;
    } & Record<string, unknown>, req: Request & {
        user?: {
            sub: string;
        };
        cronAuth?: boolean;
    }, authorization?: string, cronHeader?: string): Promise<{
        runId: string;
        status: string;
        destinationTable: string;
    }>;
    getRun(runId: string): Promise<import("pg").QueryResultRow | null>;
    runEvents(runId: string): Observable<{
        data: unknown;
    }>;
    markStale(auth?: string, cronHeader?: string): Promise<{
        marked: number;
    }>;
    runScheduled(auth?: string, cronHeader?: string): Promise<{
        error: string;
        ok?: undefined;
        due?: undefined;
        triggered?: undefined;
        skippedActive?: undefined;
        enqueued?: undefined;
        jobs?: undefined;
        connections?: undefined;
    } | {
        ok: boolean;
        due: number;
        triggered: number;
        skippedActive: number;
        enqueued: number;
        jobs: {
            runId: string;
            status: string;
            destinationTable: string;
        }[];
        connections: import("@/lib/connection/run-scheduled-connections").RunScheduledConnectionsResult;
        error?: undefined;
    }>;
}
