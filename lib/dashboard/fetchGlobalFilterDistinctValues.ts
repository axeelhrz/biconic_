import { GLOBAL_MONTH_FILTER_VALUES } from "@/lib/dashboard/globalMonthFilterValues";
import {
  getSourcesForSemanticDistinct,
  type DataSourceForDistinct,
} from "@/lib/dashboard/applyGlobalFiltersToWidget";

const DATE_DISTINCT_TRANSFORMS = new Set(["YEAR", "MONTH", "DAY", "QUARTER", "SEMESTER"]);

export type GlobalFilterDistinctInput = {
  id: string;
  field: string;
  operator?: string;
  inputType?: string;
  filterType?: string;
};

function isSelectLikeFilter(gf: GlobalFilterDistinctInput): boolean {
  return (
    !!gf.field &&
    (gf.inputType === "select" ||
      gf.inputType === "multi" ||
      gf.filterType === "single" ||
      gf.filterType === "multi")
  );
}

function dedupeValues(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const v of values) {
    const key = JSON.stringify(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * Carga valores distintos para filtros globales; en multi-ETL une resultados de todas las fuentes mapeadas.
 */
export async function fetchGlobalFilterDistinctValues(options: {
  globalFilters: GlobalFilterDistinctInput[];
  dataSources: DataSourceForDistinct[];
  primarySourceId: string | undefined;
  primaryTableName: string | undefined;
  primaryDateFields: string[];
  datasetDimensions: Record<string, Record<string, string>> | undefined;
  distinctUrl: string;
  safeJsonResponse: (res: Response) => Promise<unknown>;
}): Promise<Record<string, unknown[]>> {
  const {
    globalFilters,
    dataSources,
    primarySourceId,
    primaryTableName,
    primaryDateFields,
    datasetDimensions,
    distinctUrl,
    safeJsonResponse,
  } = options;

  const result: Record<string, unknown[]> = {};
  const selectFilters = globalFilters.filter(isSelectLikeFilter);
  const isMultiSource = (dataSources?.length ?? 0) > 1;

  for (const gf of selectFilters) {
    const filterOp = String(gf.operator ?? "").toUpperCase();
    const semanticField = gf.field;

    const mappedSources = isMultiSource
      ? getSourcesForSemanticDistinct(semanticField, dataSources, datasetDimensions)
      : [];

    const targets =
      mappedSources.length > 0
        ? mappedSources
        : primaryTableName && primarySourceId
          ? [
              {
                sourceId: primarySourceId,
                tableName: primaryTableName,
                physicalField:
                  datasetDimensions?.[semanticField]?.[primarySourceId] ?? semanticField,
                dateFields: primaryDateFields,
              },
            ]
          : [];

    if (targets.length === 0) continue;

    const allValues: unknown[] = [];

    for (const target of targets) {
      const physicalField = target.physicalField;
      const isDateField =
        !!physicalField &&
        target.dateFields.some(
          (d) => (d || "").toLowerCase() === (physicalField || "").toLowerCase()
        );

      if (filterOp === "MONTH" && isDateField) {
        allValues.push(...GLOBAL_MONTH_FILTER_VALUES);
        continue;
      }
      if (filterOp === "DAY" && isDateField) continue;

      try {
        const body: {
          tableName: string;
          field: string;
          limit: number;
          transform?: string;
        } = {
          tableName: target.tableName,
          field: physicalField,
          limit: 200,
        };
        if (isDateField) {
          const t =
            filterOp === "YEAR_MONTH"
              ? "MONTH"
              : DATE_DISTINCT_TRANSFORMS.has(filterOp)
                ? filterOp
                : "YEAR";
          body.transform = t;
        }
        const res = await fetch(distinctUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) continue;
        const data = await safeJsonResponse(res);
        const values = Array.isArray(data)
          ? data
          : (data as { values?: unknown[] })?.values;
        if (Array.isArray(values)) allValues.push(...values);
      } catch {
        // ignore per-source
      }
    }

    if (filterOp === "MONTH") {
      result[gf.id] = [...GLOBAL_MONTH_FILTER_VALUES];
    } else if (allValues.length > 0) {
      result[gf.id] = dedupeValues(allValues);
    }
  }

  return result;
}
