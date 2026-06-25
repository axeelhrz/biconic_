import { type GeoCacheClient, type GeoComponentOverrides, type GeoHints } from "../geo/geo-enrichment";
import { type DerivedColumnRef } from "./metricExpressionToSql";
export type AggregateDataResult = {
    status: number;
    data: unknown;
};
export interface AggregateDataDeps {
    databaseUrl: string;
    userId?: string | null;
    requireAuth?: boolean;
    geoCacheClient?: GeoCacheClient | null;
    executeSql: (query: string) => Promise<{
        data: unknown[] | null;
        error: {
            message: string;
        } | null;
    }>;
    findEtlIdByOutputTable: (table: string) => Promise<string | null>;
    findEtlIdByRunDestination: (table: string) => Promise<string | null>;
    getEtlLayout: (etlId: string) => Promise<Record<string, unknown> | null>;
}
interface MetricCondition {
    field: string;
    operator: string;
    value: any;
}
interface Metric {
    field: string;
    func: string;
    alias: string;
    cast?: "numeric" | "sanitize";
    condition?: MetricCondition;
    formula?: string;
    expression?: string;
}
interface Filter {
    field: string;
    operator: string;
    value: any;
    cast?: "numeric";
    id?: string;
}
interface OrderBy {
    field: string;
    direction: "ASC" | "DESC";
}
export interface AggregationRequest {
    tableName: string;
    dimension?: string;
    dimensions?: string[];
    metrics: Metric[];
    derivedColumns?: DerivedColumnRef[];
    etlId?: string;
    filters?: Filter[];
    orderBy?: OrderBy;
    limit?: number;
    unlimited?: boolean;
    cumulative?: "none" | "running_sum" | "ytd";
    comparePeriod?: "previous_year" | "previous_month";
    compare?: Record<string, unknown>;
    compareFixedValue?: number;
    transformCompare?: string;
    transformCompareFixedValue?: string;
    dateDimension?: string;
    dateGroupBy?: {
        field: string;
        granularity: "day" | "week" | "month" | "quarter" | "semester" | "year";
    };
    dateRangeFilter?: {
        field: string;
        last?: number;
        unit?: "days" | "months";
        from?: string;
        to?: string;
    };
    savedMetrics?: Array<{
        name: string;
        field?: string;
        func?: string;
        alias?: string;
        expression?: string;
    }>;
    chartType?: string;
    chartXAxis?: string;
    geoHints?: GeoHints;
    mapDefaultCountry?: string;
    geoComponentOverrides?: GeoComponentOverrides;
    geoOverridesByXLabel?: Record<string, GeoComponentOverrides>;
    dateSlashOrder?: "DMY" | "MDY";
}
export declare function runAggregateData(body: AggregationRequest, deps: AggregateDataDeps): Promise<AggregateDataResult>;
export {};
