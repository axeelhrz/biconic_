import type { DashboardDataset } from "@/lib/dashboard/dashboardDataset";
import { toLegacyDatasetDimensions, widgetSupportsDimension } from "@/lib/dashboard/dashboardDataset";
import { resolveAggregationFilterPhysicalField } from "@/lib/dashboard/resolveSemanticDateFilterField";
import type { AggLikeForDateGroupByField } from "@/lib/dashboard/dateGroupBySourceField";

export type GlobalFilterLike = {
  id: string;
  field: string;
  operator?: string;
  value?: unknown;
  inputType?: string;
  applyTo?: "all" | "selected";
  applyToWidgetIds?: string[];
};

export type MappedAggregationFilter = {
  id: string;
  field: string;
  operator: string;
  value: unknown;
  convertToNumber?: boolean;
  inputType?: string;
};

export function mapDatasetField(
  rawField: unknown,
  sourceId: string | null | undefined,
  datasetDimensions: Record<string, Record<string, string>> | undefined
): string {
  const field = String(rawField ?? "").trim();
  if (!field || !sourceId) return field;
  return datasetDimensions?.[field]?.[sourceId] ?? field;
}

export function isSemanticDimensionField(
  field: string,
  dataset: DashboardDataset | undefined,
  datasetDimensions: Record<string, Record<string, string>> | undefined
): boolean {
  if (dataset?.dimensions.some((d) => d.id === field)) return true;
  return !!(datasetDimensions && field in datasetDimensions);
}

/**
 * Resuelve campo físico para filtro global en un widget; null = no aplicar.
 */
export function resolveGlobalFilterPhysicalField(options: {
  filterField: string;
  operatorUpper: string;
  sourceId: string | null | undefined;
  dataset?: DashboardDataset;
  datasetDimensions?: Record<string, Record<string, string>>;
  agg?: AggLikeForDateGroupByField | null;
}): string | null {
  const dims =
    options.datasetDimensions ??
    (options.dataset ? toLegacyDatasetDimensions(options.dataset) : undefined);

  return resolveAggregationFilterPhysicalField({
    filterSemanticOrPhysicalField: options.filterField,
    operatorUpper: options.operatorUpper,
    datasetDimensions: dims,
    sourceId: options.sourceId,
    agg: options.agg ?? null,
    mapDatasetField: (raw) => mapDatasetField(raw, options.sourceId, dims),
  });
}

export { widgetSupportsDimension };

export function getWidgetsWithoutDimension(
  widgetIds: string[],
  widgets: { id: string; dataSourceId?: string | null; type?: string }[],
  semanticField: string,
  dataset: DashboardDataset | undefined,
  primarySourceId: string | undefined,
  dataSourceIds: string[]
): { id: string; title?: string }[] {
  const incompatible: { id: string; title?: string }[] = [];
  for (const widgetId of widgetIds) {
    const w = widgets.find((x) => x.id === widgetId);
    if (!w || w.type === "filter") continue;
    const widgetSourceId = w.dataSourceId ?? primarySourceId ?? dataSourceIds[0];
    if (!widgetSupportsDimension(widgetSourceId ?? "", semanticField, dataset)) {
      incompatible.push({ id: w.id });
    }
  }
  return incompatible;
}

export type DataSourceForDistinct = {
  id: string;
  schema?: string;
  tableName: string;
  fields?: { date?: string[] };
};

/**
 * Fuentes que tienen mapeo para una dimensión semántica (para distinct-values).
 */
export function getSourcesForSemanticDistinct(
  semanticField: string,
  dataSources: DataSourceForDistinct[],
  datasetDimensions: Record<string, Record<string, string>> | undefined
): { sourceId: string; tableName: string; physicalField: string; dateFields: string[] }[] {
  const bySource = datasetDimensions?.[semanticField];
  if (!bySource) return [];
  const result: { sourceId: string; tableName: string; physicalField: string; dateFields: string[] }[] = [];
  for (const ds of dataSources) {
    const physical = bySource[ds.id];
    if (!physical) continue;
    const tableName = `${ds.schema ?? "etl_output"}.${ds.tableName}`;
    result.push({
      sourceId: ds.id,
      tableName,
      physicalField: physical,
      dateFields: ds.fields?.date ?? [],
    });
  }
  return result;
}
