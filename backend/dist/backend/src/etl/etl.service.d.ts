import { Queue } from "bullmq";
import { DatabaseService } from "../database/database.service";
export declare class EtlService {
    private readonly db;
    private readonly etlQueue;
    constructor(db: DatabaseService, etlQueue: Queue);
    enqueueRun(payload: {
        etlId: string;
        userId: string;
        body: Record<string, unknown>;
    }): Promise<{
        runId: string;
        status: string;
        destinationTable: string;
    }>;
    getRunStatus(runId: string): Promise<import("pg").QueryResultRow | null>;
    listEtlsForUser(userId: string, appRole: string): Promise<import("pg").QueryResultRow[]>;
    markStaleRunsFailed(): Promise<{
        marked: number;
    }>;
    runScheduled(secret: string): Promise<{
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
