export type JoinQueryEtlResult = {
    ok: boolean;
    error?: string;
    rows?: unknown[];
    sourceExhausted?: boolean;
    nextSourceOffset?: number;
    materialized?: boolean;
};
export declare function executeJoinQueryForEtlRun(body: Record<string, unknown>): Promise<JoinQueryEtlResult>;
