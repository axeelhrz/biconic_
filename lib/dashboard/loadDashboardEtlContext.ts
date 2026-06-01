import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveFieldsFromSample } from "@/lib/dashboard/deriveFieldsFromSample";
import {
  buildDashboardDataset,
  dashboardDatasetFromLegacy,
  fieldsFingerprint,
  parseLayoutDashboardDataset,
  toLegacyDatasetDimensions,
  type DashboardDataset,
  type DashboardDatasetWarnings,
  type DashboardSourceInput,
} from "@/lib/dashboard/dashboardDataset";
import {
  extractColumnDisplayFromEtlLayout,
  resolveEtlToTableAndFields,
} from "@/lib/dashboard/resolveEtlToTable";

export type DashboardEtlDataSource = {
  id: string;
  etlId: string;
  alias: string;
  etlName: string;
  schema: string;
  tableName: string;
  rowCount: number;
  fields: ReturnType<typeof deriveFieldsFromSample>;
  savedMetrics: unknown[];
  fieldsFingerprint: string;
};

export type LoadDashboardEtlContextResult = {
  dashboard: Record<string, unknown>;
  dataSources: DashboardEtlDataSource[];
  primarySourceId: string | null;
  etl: { id: string; title: string; name: string } | null;
  etlData: {
    id: number;
    name: string;
    created_at: string;
    dataArray: unknown[];
    rowCount: number;
  } | null;
  fields: ReturnType<typeof deriveFieldsFromSample>;
  dashboardDataset: DashboardDataset;
  datasetDimensions: Record<string, Record<string, string>>;
  datasetWarnings: DashboardDatasetWarnings;
  /** true si el dataset fue recalculado respecto al layout guardado */
  datasetNeedsPersist: boolean;
};

type SourceRow = { id: string; etl_id: string; alias: string; sort_order: number };

export async function loadDashboardEtlContext(
  supabase: SupabaseClient,
  dashboard: Record<string, unknown> & { id: string; etl_id?: string | null; layout?: unknown }
): Promise<LoadDashboardEtlContextResult | { error: string; status: number }> {
  const dashboardId = dashboard.id;

  let sourceRows: SourceRow[] = [];
  const { data: sources } = await supabase
    .from("dashboard_data_sources")
    .select("id, etl_id, alias, sort_order")
    .eq("dashboard_id", dashboardId)
    .order("sort_order", { ascending: true });

  if (sources && sources.length > 0) {
    sourceRows = sources as SourceRow[];
  } else if (dashboard.etl_id) {
    sourceRows = [
      { id: "primary", etl_id: dashboard.etl_id, alias: "Principal", sort_order: 0 },
    ];
  }

  if (sourceRows.length === 0) {
    return { error: "Dashboard no tiene fuentes de datos (ETL) asociadas", status: 400 };
  }

  const dataSources: DashboardEtlDataSource[] = [];
  let firstEtl: { id: string; title: string; name: string } | null = null;
  let firstEtlData: { name: string; rowCount: number; created_at: string | null } | null = null;
  let firstFields: ReturnType<typeof deriveFieldsFromSample> | null = null;
  const sourceInputs: DashboardSourceInput[] = [];

  for (const row of sourceRows) {
    const resolved = await resolveEtlToTableAndFields(supabase, row.etl_id);
    if (!resolved || resolved.sampleData.length === 0) continue;

    const { data: etlRow } = await supabase
      .from("etl")
      .select("id, title, name, layout")
      .eq("id", row.etl_id)
      .maybeSingle();

    const etlName =
      (etlRow as { title?: string; name?: string } | null)?.title ||
      (etlRow as { title?: string; name?: string } | null)?.name ||
      row.alias;
    const layout = (etlRow as { layout?: unknown } | null)?.layout;
    const fields = deriveFieldsFromSample(resolved.sampleData);
    const savedMetrics = Array.isArray(
      (layout as { saved_metrics?: unknown[] })?.saved_metrics
    )
      ? (layout as { saved_metrics: unknown[] }).saved_metrics
      : Array.isArray((layout as { savedMetrics?: unknown[] })?.savedMetrics)
        ? (layout as { savedMetrics: unknown[] }).savedMetrics
        : [];

    const fp = fieldsFingerprint(fields);
    sourceInputs.push({
      id: row.id,
      etlId: row.etl_id,
      alias: row.alias,
      fields,
      columnDisplay: extractColumnDisplayFromEtlLayout(layout),
    });

    dataSources.push({
      id: row.id,
      etlId: row.etl_id,
      alias: row.alias,
      etlName,
      schema: resolved.schema,
      tableName: resolved.tableName,
      rowCount: resolved.rowCount,
      fields,
      savedMetrics,
      fieldsFingerprint: fp,
    });

    if (!firstEtl) {
      firstEtl = etlRow as { id: string; title: string; name: string };
      firstEtlData = {
        name:
          resolved.schema && resolved.tableName
            ? `${resolved.schema}.${resolved.tableName}`
            : resolved.tableName,
        rowCount: resolved.rowCount,
        created_at: resolved.created_at,
      };
      firstFields = fields;
    }
  }

  if (dataSources.length === 0) {
    return { error: "No se encontraron datos en ninguna fuente del ETL", status: 404 };
  }

  const layoutObj = dashboard.layout as {
    dashboardDataset?: DashboardDataset;
    datasetDimensions?: Record<string, Record<string, string>>;
    sourceFingerprints?: Record<string, string>;
  } | null;

  let savedDataset = parseLayoutDashboardDataset(layoutObj);
  if (!savedDataset && layoutObj?.datasetDimensions) {
    savedDataset = dashboardDatasetFromLegacy(
      layoutObj.datasetDimensions,
      dataSources.map((s) => ({ id: s.id }))
    );
  }

  const { dataset, datasetDimensions, warnings } = buildDashboardDataset(
    sourceInputs,
    savedDataset
  );

  const storedFingerprints = layoutObj?.sourceFingerprints ?? {};
  let datasetNeedsPersist = !layoutObj?.dashboardDataset && !layoutObj?.datasetDimensions;
  for (const ds of dataSources) {
    if (storedFingerprints[ds.id] !== ds.fieldsFingerprint) {
      datasetNeedsPersist = true;
      break;
    }
  }
  if (!datasetNeedsPersist && !savedDataset) {
    datasetNeedsPersist = true;
  }

  return {
    dashboard,
    dataSources,
    primarySourceId: dataSources[0]?.id ?? null,
    etl: firstEtl,
    etlData: firstEtlData
      ? {
          id: 0,
          name: firstEtlData.name,
          created_at: firstEtlData.created_at || new Date().toISOString(),
          dataArray: [],
          rowCount: firstEtlData.rowCount,
        }
      : null,
    fields: firstFields ?? { all: [], numeric: [], string: [], date: [] },
    dashboardDataset: dataset,
    datasetDimensions,
    datasetWarnings: warnings,
    datasetNeedsPersist,
  };
}

export function buildLayoutWithDashboardDataset(
  existingLayout: Record<string, unknown> | null | undefined,
  dataset: DashboardDataset,
  dataSources: DashboardEtlDataSource[]
): Record<string, unknown> {
  const base = existingLayout && typeof existingLayout === "object" ? { ...existingLayout } : {};
  const sourceFingerprints: Record<string, string> = {};
  for (const ds of dataSources) {
    sourceFingerprints[ds.id] = ds.fieldsFingerprint;
  }
  return {
    ...base,
    dashboardDataset: dataset,
    datasetDimensions: toLegacyDatasetDimensions(dataset),
    sourceFingerprints,
  };
}

export async function persistDashboardDatasetIfNeeded(
  supabase: SupabaseClient,
  dashboardId: string,
  ctx: LoadDashboardEtlContextResult
): Promise<void> {
  if (!ctx.datasetNeedsPersist) return;
  const layout = buildLayoutWithDashboardDataset(
    ctx.dashboard.layout as Record<string, unknown> | undefined,
    ctx.dashboardDataset,
    ctx.dataSources
  );
  await supabase
    .from("dashboard")
    .update({ layout: layout as unknown as import("@/lib/supabase/database.types").Json })
    .eq("id", dashboardId);
}
