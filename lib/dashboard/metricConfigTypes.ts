import type { GeoComponentOverrides } from "@/lib/geo/geo-enrichment";
import type { ChartLabelDisplayMode, ChartPercentBasis } from "@/lib/dashboard/chartOptions";
import type { DimensionDefaultFilterEdit } from "@/lib/dashboard/dimensionDefaultFilters";
import type { ChartDetailCardConfig } from "@/lib/dashboard/chartDetailCard";
import type { CompareSpec, ComparePeriodSource } from "@/lib/dashboard/compareSpec";
import type { DashboardCompareUi } from "@/lib/dashboard/compareDisplayKeys";

export type { DimensionDefaultFilterEdit };

export type MetricConditionEdit = {
  field: string;
  operator: string;
  value: unknown;
};

export type AggregationMetricEdit = {
  id: string;
  field: string;
  func: string;
  alias: string;
  condition?: MetricConditionEdit;
  formula?: string;
  expression?: string;
};

export type AggregationFilterEdit = {
  id: string;
  field: string;
  operator: string;
  value: unknown;
};

export type AggregationConfigEdit = {
  enabled: boolean;
  dimension?: string;
  dimension2?: string;
  dimensions?: string[];
  metrics: AggregationMetricEdit[];
  filters?: AggregationFilterEdit[];
  dimensionDefaultFilters?: DimensionDefaultFilterEdit[];
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  cumulative?: "none" | "running_sum" | "ytd";
  comparePeriod?: "previous_year" | "previous_month";
  compare?: CompareSpec;
  dateDimension?: string;
  comparePeriodSource?: ComparePeriodSource;
  compareFixedValue?: number;
  transformCompare?: string;
  transformCompareFixedValue?: string;
  transformShowDelta?: boolean;
  transformShowDeltaPct?: boolean;
  transformShowAccum?: boolean;
  dashboardCompareUi?: DashboardCompareUi;
  chartType?: string;
  chartXAxis?: string;
  chartYAxes?: string[];
  chartSeriesField?: string;
  chartNumberFormat?: string;
  chartValueType?: string;
  chartValueScale?: string;
  chartCurrencySymbol?: string;
  chartThousandSep?: boolean;
  chartDecimals?: number;
  chartSortDirection?: string;
  chartSortBy?: string;
  chartSortByMetric?: string;
  chartAxisOrder?: string;
  chartScaleMode?: string;
  chartScaleMin?: string | number;
  chartScaleMax?: string | number;
  chartAxisStep?: string | number;
  chartRankingEnabled?: boolean;
  chartRankingTop?: number;
  chartRankingMetric?: string;
  chartRankingDirection?: "asc" | "desc";
  chartRankingPinnedXValues?: string[];
  chartRankingShowRankInLabel?: boolean;
  chartPinnedDimensions?: string[];
  chartColorScheme?: string;
  chartCategoryColorMode?: "varied" | "uniform";
  chartPrimaryColor?: string;
  chartSeriesColors?: Record<string, string>;
  showDataLabels?: boolean;
  labelVisibilityMode?: "all" | "auto" | "min_max";
  chartLabelOverrides?: Record<string, string>;
  chartDatasetLabelOverrides?: Record<string, string>;
  chartMetricFormats?: Record<
    string,
    { valueType?: string; valueScale?: string; currencySymbol?: string; decimals?: number; thousandSep?: boolean }
  >;
  chartComboSyncAxes?: boolean;
  chartGridXDisplay?: boolean;
  chartGridYDisplay?: boolean;
  chartGridColor?: string;
  chartAxisXVisible?: boolean;
  chartAxisYVisible?: boolean;
  chartDataLabelFontSize?: number;
  chartDataLabelColor?: string;
  chartAxisFontSize?: number;
  chartLayoutPadding?: number;
  chartBarThickness?: number;
  chartLineBorderWidth?: number;
  chartGridLineWidth?: number;
  chartAxisTickColor?: string;
  chartCategoryTickMaxRotation?: number;
  chartCategoryTickMinRotation?: number;
  chartCategoryMaxTicks?: number;
  chartFontFamily?: string;
  labelVisibilityMaxCount?: number;
  chartLegendPosition?: "top" | "bottom" | "left" | "right" | "chartArea";
  chartLegendVisible?: boolean;
  pieLegendVisible?: boolean;
  pieLegendResponsive?: boolean;
  pieLegendMode?: "side" | "integrated";
  pieIntegratedNameOrder?: "above" | "below";
  pieSliceBorderWidth?: number;
  chartStackBySeries?: boolean;
  dateGroupByGranularity?: "day" | "week" | "month" | "quarter" | "semester" | "year";
  analysisDateDisplayFormat?: "short" | "monthYear" | "year" | "datetime";
  dateSlashOrder?: "DMY" | "MDY";
  mapDefaultCountry?: string;
  geoHints?: {
    countryField?: string;
    provinceField?: string;
    cityField?: string;
    addressField?: string;
    latField?: string;
    lonField?: string;
  };
  geoComponentOverrides?: GeoComponentOverrides;
  geoOverridesByXLabel?: Record<string, GeoComponentOverrides>;
  tableColumnLabelOverrides?: Record<string, string>;
  chartDetailCard?: ChartDetailCardConfig;
};

export type AddMetricFormConfig = {
  title: string;
  type: string;
  gridSpan?: number;
  color?: string;
  labelDisplayMode?: ChartLabelDisplayMode;
  chartPercentBasis?: ChartPercentBasis;
  chartPercentGroupField?: string;
  chartPercentDenominatorMetric?: string;
  chartPercentDenominatorScope?: "analysis" | "visible";
  chartPercentDenominatorGrandTotal?: boolean;
  kpiSecondaryLabel?: string;
  kpiSecondaryValue?: string;
  kpiCaption?: string;
  aggregationConfig: AggregationConfigEdit;
  excludeGlobalFilters?: boolean;
  dataSourceId?: string | null;
};

/** Config persistida en métrica ETL (sin requerir `enabled` del panel de widget). */
export type SavedMetricAggregationConfig = Omit<AggregationConfigEdit, "enabled" | "metrics"> & {
  metrics: AggregationMetricEdit[];
  chartScalePerMetric?: Record<string, { min?: number; max?: number; step?: number }>;
  dateRangeFilter?: { field: string; last?: number; unit?: string; from?: string; to?: string };
  interCrossFilter?: boolean;
  interCrossFilterFields?: string[];
  interDrilldown?: boolean;
  interDrilldownHierarchy?: string[];
  interDrillThrough?: boolean;
  interDrillThroughTarget?: string;
  interTooltipFields?: string[];
  interHighlight?: boolean;
  ratioReuseMode?: boolean;
};

export type SavedMetricForm = {
  id: string;
  name: string;
  metric: AggregationMetricEdit;
  chartType?: string;
  aggregationConfig?: SavedMetricAggregationConfig;
};
