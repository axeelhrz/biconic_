import type { DashboardComparePlacement, DashboardCompareUi } from "./compareDisplayKeys";
export type AggForDashboardCompareUi = {
    compare?: unknown;
    comparePeriod?: "previous_year" | "previous_month";
    compareFixedValue?: number;
    transformCompare?: string;
    transformCompareFixedValue?: string;
    transformShowDelta?: boolean;
    transformShowDeltaPct?: boolean;
    dashboardCompareUi?: DashboardCompareUi;
    dateDimension?: string;
};
export type EnsureDashboardCompareUiOptions = {
    widgetType?: string;
    chartType?: string;
};
export declare function defaultComparePlacementsForWidgetType(widgetType?: string, chartType?: string): DashboardComparePlacement[];
export declare function ensureDashboardCompareUi(agg: AggForDashboardCompareUi, options?: EnsureDashboardCompareUiOptions): DashboardCompareUi | undefined;
export declare function getEffectiveDashboardCompareUi(agg: AggForDashboardCompareUi | null | undefined, options?: EnsureDashboardCompareUiOptions): DashboardCompareUi | undefined;
export declare function effectivePlacementEnabled(agg: AggForDashboardCompareUi | null | undefined, placement: DashboardComparePlacement, options?: EnsureDashboardCompareUiOptions): boolean;
