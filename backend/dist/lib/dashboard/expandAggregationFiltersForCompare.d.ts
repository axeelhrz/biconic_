import type { CompareSpec } from "./compareSpec";
import { type ComparePeriodSource } from "./compareSpec";
export type AggregationFilterLike = {
    field?: string;
    operator?: string;
    value?: unknown;
    [key: string]: unknown;
};
export declare function shiftCalendarYearMonth(year: number, month1: number, deltaMonths: number): {
    year: number;
    month1: number;
};
export declare function expandAggregationFiltersForTemporalCompare(filters: readonly AggregationFilterLike[], options: {
    compareField: string;
    compareSpec: CompareSpec;
    periodSource?: ComparePeriodSource;
    aggComparePeriodSource?: ComparePeriodSource | string | null;
    relatedDateFields?: string[];
}): AggregationFilterLike[];
