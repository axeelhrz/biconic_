export type ValueFormatType = "none" | "currency" | "percent";
export type ValueScaleType = "none" | "K" | "M" | "Bi" | "B";
export type ChartStyleConfig = {
    valueFormat?: ValueFormatType;
    valueScale?: ValueScaleType;
    currencySymbol?: string;
    decimals?: number;
    useGrouping?: boolean;
    layoutPadding?: number;
    dataLabelFontSize?: number;
    dataLabelColor?: string;
    axisXVisible?: boolean;
    axisYVisible?: boolean;
    axisXReverse?: boolean;
    axisYReverse?: boolean;
    barThickness?: number;
    barBorderRadius?: number;
    lineBorderWidth?: number;
    pointRadius?: number;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    fontSize?: number;
    gridXDisplay?: boolean;
    gridYDisplay?: boolean;
    gridColor?: string;
    gridLineWidth?: number;
    axisTickColor?: string;
    categoryTickMaxRotation?: number;
    categoryTickMinRotation?: number;
    categoryMaxTicks?: number;
    chartFontFamily?: string;
};
export declare function formatValue(value: number, format?: ValueFormatType, currencySymbol?: string, scale?: ValueScaleType, decimals?: number, useGrouping?: boolean): string;
export declare function getLayoutPadding(style?: ChartStyleConfig | null): number;
export type ChartPercentBasis = "chart_visible_total" | "analysis_total" | "per_series" | "per_category_axis" | "per_dimension_group" | "per_denominator_metric" | "grand_total" | "per_category";
export type ChartLabelDisplayMode = "percent" | "value" | "both";
export declare function normalizeChartPercentBasis(b?: unknown): ChartPercentBasis;
export declare function sumFiniteNumbers(values: unknown[]): number;
export declare function resolvePercentDenominator(basis: ChartPercentBasis, datasets: Array<{
    data?: unknown[];
} | undefined> | undefined, dataIndex: number, datasetIndex: number): number;
export type FormatChartPointContext = {
    chart?: {
        data?: {
            datasets?: Array<{
                data?: unknown[];
            }>;
        };
    };
    dataIndex?: number;
    datasetIndex?: number;
    percentDenominator?: number;
};
export declare function formatChartPointDisplay(rawValue: number, style: ChartStyleConfig | null | undefined, labelMode: ChartLabelDisplayMode | undefined, percentBasis: ChartPercentBasis, ctx?: FormatChartPointContext): string;
export declare function getValueFormatter(style?: ChartStyleConfig | null, labelMode?: ChartLabelDisplayMode, percentBasis?: ChartPercentBasis): (value: number, ctx?: FormatChartPointContext) => string;
export type ChartLabelVisibilityMode = "all" | "auto" | "min_max";
export declare function normalizeLabelVisibilityMode(mode?: unknown): ChartLabelVisibilityMode;
export declare function getSampledIndices(total: number, maxVisible?: number): Set<number>;
export declare function getMinMaxValueIndices(values: unknown[]): Set<number>;
export declare function getVisibleIndices(params: {
    total: number;
    mode?: ChartLabelVisibilityMode;
    values?: unknown[];
    maxVisible?: number;
}): Set<number>;
export declare function createCategoryTickCallback(params: {
    labels?: unknown[];
    mode?: ChartLabelVisibilityMode;
    maxVisible?: number;
    formatter?: (raw: unknown, index: number) => string;
}): (value: unknown, index: number) => string;
export declare function createDataLabelDisplay(params: {
    mode?: ChartLabelVisibilityMode;
    labels?: unknown[];
    datasets?: Array<{
        data?: unknown[];
    }>;
    maxVisible?: number;
}): boolean | ((ctx: {
    datasetIndex?: number;
    dataIndex?: number;
}) => boolean);
export declare function createLegendLabelFilter(params: {
    mode?: ChartLabelVisibilityMode;
    labels?: unknown[];
    datasets?: Array<{
        data?: unknown[];
    }>;
    maxVisible?: number;
}): ((item: {
    index?: number;
    datasetIndex?: number;
}) => boolean) | undefined;
export declare function buildChartOptions(type: "bar" | "line" | "pie" | "doughnut" | "horizontalBar", style?: ChartStyleConfig | null, labelDisplayMode?: ChartLabelDisplayMode, chartPercentBasis?: ChartPercentBasis): Record<string, unknown>;
export type ChartFormatConfigInput = {
    valueType?: string;
    valueScale?: string;
    currencySymbol?: string;
    decimals?: number;
    thousandSep?: boolean;
};
export declare function toChartStyleConfig(input?: ChartFormatConfigInput | null): ChartStyleConfig;
export type PieDoughnutLegendPosition = "top" | "bottom" | "left" | "right" | "chartArea";
export declare function getPieLegendMaxWidthScriptable(position: PieDoughnutLegendPosition): (ctx: {
    chart: {
        width: number;
    };
}) => number;
export declare function getPieDoughnutLayoutPadding(position: PieDoughnutLegendPosition, basePadding?: number): {
    top: number;
    right: number;
    bottom: number;
    left: number;
};
export type BuildPieDoughnutLegendOptions = {
    legendPosition?: PieDoughnutLegendPosition;
    labelCount?: number;
};
export declare function buildPieDoughnutLegendShared(chartConfig: {
    labels?: string[];
    datasets?: Array<{
        backgroundColor?: string | string[];
    }>;
} | null | undefined, textColor?: string, options?: BuildPieDoughnutLegendOptions): Record<string, unknown>;
export declare function buildMiniChartOptions(horizontal?: boolean): Record<string, unknown>;
