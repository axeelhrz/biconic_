export declare const DATE_OPERATORS_WITH_MULTI_VALUE_SQL: Set<string>;
export type GlobalFilterLike = {
    id: string;
    field: string;
    operator?: string;
    value?: unknown;
    inputType?: string;
};
export declare function expandMonthFilterValueWithYear(globalFilters: readonly GlobalFilterLike[], filterValues: Record<string, unknown>, ctx: {
    field: string;
    operator?: string;
    value: unknown;
}): unknown;
export declare function expandMonthValueWithYearFromFilters(field: string, monthValue: unknown, allFilters: readonly {
    field: string;
    operator?: string;
    value: unknown;
}[]): unknown;
