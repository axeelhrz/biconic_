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
    } & Record<string, unknown>, req: Request & {
        user: {
            sub: string;
        };
    }): Promise<{
        runId: string;
        status: string;
        destinationTable: string;
    }>;
    getRun(runId: string): Promise<import("pg").QueryResultRow | null>;
    runEvents(runId: string): Observable<{
        data: unknown;
    }>;
    markStale(auth?: string): Promise<{
        marked: number;
    }>;
    runScheduled(auth?: string): Promise<{
        error: string;
        enqueued?: undefined;
        jobs?: undefined;
    } | {
        enqueued: number;
        jobs: {
            runId: string;
            status: string;
            destinationTable: string;
        }[];
        error?: undefined;
    }>;
}
