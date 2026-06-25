export type AggLikeForDateGroupByField = {
    dimension?: string;
    dimensions?: string[];
    dimension2?: string;
    dateDimension?: string;
    chartXAxis?: string;
    dateGroupByGranularity?: string;
};
export declare function dimensionsListFromAgg(agg: AggLikeForDateGroupByField | null | undefined): string[];
export declare function primaryDimensionForDateGroupBy(agg: AggLikeForDateGroupByField | null | undefined): string | undefined;
export declare function pickDateGroupBySourceField(agg: AggLikeForDateGroupByField | null | undefined): string | undefined;
export declare function pickSemanticDateAxisForGlobalFilters(agg: AggLikeForDateGroupByField | null | undefined): string | undefined;
