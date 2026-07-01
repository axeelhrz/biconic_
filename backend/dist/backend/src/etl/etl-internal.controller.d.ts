import { type RunBody } from "../../../lib/etl/execute-etl-pipeline";
export declare class EtlInternalController {
    runPipeline(body: RunBody & {
        runId?: string;
        userId?: string;
        asyncWorker?: boolean;
        waitForCompletion?: boolean;
    }, internalSecret?: string): Promise<{
        ok: boolean;
        runId: string;
        status: string;
        completed?: undefined;
        rowsProcessed?: undefined;
    } | {
        ok: boolean;
        runId: string;
        completed: boolean;
        rowsProcessed: number;
        status?: undefined;
    }>;
}
