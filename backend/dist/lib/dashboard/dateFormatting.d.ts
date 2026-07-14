export type DateGranularity = "day" | "week" | "month" | "quarter" | "semester" | "year";
export type DateSlashOrder = "DMY" | "MDY";
export type ParseDateLikeOptions = {
    slashDateOrder?: DateSlashOrder;
};
export declare function dateSlashOrderFromColumnFormat(format?: string | null): DateSlashOrder;
export declare function dateSlashOrderForNamedColumn(columnDisplay: Record<string, {
    format?: string;
}> | undefined, columnName: string | undefined): DateSlashOrder;
export declare function parseDateLike(value: unknown, options?: ParseDateLikeOptions): Date | null;
export declare function formatDateByGranularity(value: unknown, granularity: DateGranularity, fallback?: string, parseOpts?: ParseDateLikeOptions): string | null;
export type AnalysisDateDisplayFormat = "short" | "monthYear" | "year" | "datetime";
export declare function parseIsoYearMonthForLabel(value: unknown): {
    year: number;
    month: number;
} | null;
export declare function resolveMonthYearFromAmbiguousSlash(raw: string, parseOpts?: ParseDateLikeOptions): {
    year: number;
    month: number;
} | null;
export declare function formatAnalysisDateForChart(value: unknown, granularity: DateGranularity, displayFormat: AnalysisDateDisplayFormat | undefined, fallback?: string, parseOpts?: ParseDateLikeOptions): string | null;
