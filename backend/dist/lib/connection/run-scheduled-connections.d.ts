export type RunScheduledConnectionsResult = {
    due: number;
    triggered: number;
    skippedActive: number;
    excelReimports: number;
    etlRuns: number;
};
export declare function runScheduledConnections(cronSecret: string): Promise<RunScheduledConnectionsResult>;
