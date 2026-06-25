import type { DateGranularity, ParseDateLikeOptions } from "./dateFormatting";
export type KpiScopeFilterLike = {
    field?: string;
    operator?: string;
    value?: unknown;
};
export type KpiUserTimeScopeOptions = {
    timeColumn: string;
    granularity: DateGranularity;
    userFilters: KpiScopeFilterLike[];
    parseOpts?: ParseDateLikeOptions;
};
export declare function filterRowsToUserTimeScope(rows: Record<string, unknown>[], options: KpiUserTimeScopeOptions): Record<string, unknown>[];
export declare function resolveDashboardKpiMainValueForScope(rows: Record<string, unknown>[], yKey: string, scopeOptions?: KpiUserTimeScopeOptions | null): number;
