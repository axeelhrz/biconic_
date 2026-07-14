import type { DateGranularity } from "./dateFormatting";
export type ComparePeriodSource = "dashboard" | "widget" | "fixed" | "data_max";
export type CompareTemporalMode = "prev_bucket" | "same_period_prior_year" | "calendar_prev_day" | "calendar_prev_week" | "calendar_prev_month" | "calendar_prev_year";
export type CompareAverageScope = "global" | "partition";
export type CompareCumulativeMode = "month_vs_ytd" | "vs_prior_year_ytd" | "ytd_running";
export type CompareSpec = {
    kind: "none";
} | {
    kind: "temporal";
    mode: CompareTemporalMode;
    timeColumn: string;
    granularity: DateGranularity;
    periodSource?: ComparePeriodSource;
} | {
    kind: "column";
    refColumn: string;
} | {
    kind: "fixed";
    value: number;
} | {
    kind: "average";
    scope: CompareAverageScope;
    partitionDimensions: string[];
} | {
    kind: "total_share";
    partitionDimensions: string[];
} | {
    kind: "cumulative";
    mode: CompareCumulativeMode;
    timeColumn: string;
    granularity: DateGranularity;
    periodSource?: ComparePeriodSource;
} | {
    kind: "comparative";
    relationId: string;
    metricAlias: string;
    comparativeField: string;
};
export type LegacyCompareInput = {
    compare?: unknown;
    comparePeriod?: "previous_year" | "previous_month";
    compareFixedValue?: number;
    transformCompare?: string;
    transformCompareFixedValue?: string;
    dateGroupBy?: {
        field: string;
        granularity?: string;
    };
    dateDimension?: string;
};
export declare function normalizeAggregationCompare(input: LegacyCompareInput): CompareSpec;
export declare function getComparePeriodSource(spec: CompareSpec, aggComparePeriodSource?: ComparePeriodSource | string | null): ComparePeriodSource;
export declare function deriveLegacyTransformCompare(spec: CompareSpec): "none" | "mom" | "yoy" | "fixed";
