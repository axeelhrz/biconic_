export declare const ETL_RUN_PROGRESS_PREFIX = "\u23F3 ";
export declare function isEtlRunProgressMessage(msg: string | null | undefined): boolean;
export declare function formatEtlRunProgressMessage(text: string): string;
export declare function reportEtlRunProgress(supabaseAdmin: {
    from: (t: string) => any;
}, runId: string, options: {
    message: string;
    rowsProcessed?: number;
}): Promise<void>;
export declare function clearEtlRunProgressMessage(supabaseAdmin: {
    from: (t: string) => any;
}, runId: string): Promise<void>;
