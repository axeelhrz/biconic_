import type { CompareSpec, LegacyCompareInput } from "./compareSpec";
import { type ChartStyleConfig } from "./chartOptions";
import type { ParseDateLikeOptions } from "./dateFormatting";
import type { KpiUserTimeScopeOptions } from "./kpiFilterScope";
export type DashboardCompareIndicator = "none" | "icon" | "color" | "both";
export type DashboardComparePlacement = "kpi_below" | "table_extra_columns" | "line_reference_series" | "tooltip" | "detail_card";
export type DashboardCompareUi = {
    enabled?: boolean;
    label?: string;
    showDelta?: boolean;
    showDeltaPct?: boolean;
    placement?: DashboardComparePlacement | DashboardComparePlacement[];
    indicator?: DashboardCompareIndicator;
    showCardHeaderStrip?: boolean;
};
export declare function normalizeComparePlacements(raw: DashboardCompareUi["placement"]): DashboardComparePlacement[];
export declare function placementEnabled(ui: DashboardCompareUi | undefined, p: DashboardComparePlacement): boolean;
export declare function resolveShowCardHeaderStrip(params: {
    compareUi?: DashboardCompareUi;
    dashboardDefaults?: {
        showCardHeaderStrip?: boolean;
    };
    compareInheritDashboard?: boolean;
}): boolean;
export type CompareColumnKeys = {
    resolvedMetricKey: string | null;
    referenceKey: string | null;
    deltaKey: string | null;
    deltaPctKey: string | null;
    referenceSeriesKey: string | null;
    tableExtraKeys: string[];
};
export type ComparePresentationValues = {
    current: number | null;
    reference: number | null;
    delta: number | null;
    deltaPct: number | null;
};
export declare function compareNeedsTimeGroupedRows(spec: CompareSpec): boolean;
export declare function getCompareColumnKeys(spec: CompareSpec, metricAlias: string, row: Record<string, unknown>): CompareColumnKeys;
export declare function readComparePresentation(spec: CompareSpec, metricAlias: string, row: Record<string, unknown>): ComparePresentationValues;
export declare function resolveDashboardKpiMainValue(rows: Record<string, unknown>[], yKey: string): number;
export declare function pickDashboardKpiCompareRow(rows: Record<string, unknown>[], spec: CompareSpec, parseOpts?: ParseDateLikeOptions): Record<string, unknown> | null;
export declare function kpiCompareRowsFingerprint(rows: Record<string, unknown>[] | undefined, agg: Parameters<typeof legacyCompareInputFromWidgetAgg>[0]): string;
export declare function compareTrendTone(values: ComparePresentationValues): "up" | "down" | "flat";
export declare function formatDashboardCompareText(ui: DashboardCompareUi, values: ComparePresentationValues, valueStyle?: ChartStyleConfig): string;
export declare function legacyCompareInputFromWidgetAgg(agg: {
    compare?: unknown;
    comparePeriod?: "previous_year" | "previous_month";
    compareFixedValue?: number;
    transformCompare?: string;
    transformCompareFixedValue?: string;
    dateDimension?: string;
    dateGroupByGranularity?: string;
    dimension?: string;
    dimensions?: string[];
    dimension2?: string;
} | null | undefined): LegacyCompareInput;
export declare function buildCompareTooltipLineFromAgg(agg: {
    compare?: unknown;
    comparePeriod?: "previous_year" | "previous_month";
    compareFixedValue?: number;
    transformCompare?: string;
    transformCompareFixedValue?: string;
    dateDimension?: string;
    dateGroupByGranularity?: string;
    dimension?: string;
    dimensions?: string[];
    dimension2?: string;
    dashboardCompareUi?: DashboardCompareUi;
} | null | undefined, row: Record<string, unknown>, primaryMetricAlias: string, valueStyle?: ChartStyleConfig): string | null;
export declare function compareKindBadgeLabel(compare: CompareSpec): string | null;
export type WidgetCompareStatus = {
    active: boolean;
    badge: string | null;
    line: string | null;
    unavailable: boolean;
    reason?: string;
};
export declare function resolveWidgetCompareStatus(params: {
    compareSpec: CompareSpec;
    compareUi?: DashboardCompareUi;
    compareLabel?: string | null;
    compareUnavailable?: boolean;
    compareUnavailableReason?: string;
    rows?: Record<string, unknown>[];
    metricAlias?: string;
    kpiUserTimeScope?: KpiUserTimeScopeOptions | null;
    chartStyle?: ChartStyleConfig;
    showCardHeaderStrip?: boolean;
}): WidgetCompareStatus;
