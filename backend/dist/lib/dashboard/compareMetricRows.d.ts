import type { CompareSpec } from "./compareSpec";
import { type DateGranularity, type ParseDateLikeOptions } from "./dateFormatting";
export declare function resolveRowColumnKey(row: Record<string, unknown>, col: string): string | null;
export declare function getRowValue(row: Record<string, unknown>, col: string): unknown;
export declare function shiftBucketLabelOneYear(raw: unknown, gran: DateGranularity, parseOpts?: ParseDateLikeOptions): string | null;
export declare function shiftCalendarBucketLabel(raw: unknown, gran: DateGranularity, mode: "calendar_prev_day" | "calendar_prev_week" | "calendar_prev_month" | "calendar_prev_year", parseOpts?: ParseDateLikeOptions): string | null;
export declare function compareBucketSortTime(value: unknown, gran: DateGranularity, parseOpts?: ParseDateLikeOptions): number;
export type ApplyCompareRowsOptions = {
    parseDateOpts?: ParseDateLikeOptions;
    dimensionColumns: string[];
};
export declare function applyCompareSpecToRows(rows: Record<string, unknown>[], metricAliases: string[], spec: CompareSpec, opts: ApplyCompareRowsOptions): Record<string, unknown>[];
