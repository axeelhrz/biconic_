import type { AppDbClient } from "@/lib/supabase/db-client";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import { createServiceRoleClient } from "@/lib/supabase/service";
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

/** Repara dashboards sin filas en dashboard_data_sources (migración / creación incompleta). */
async function ensureDashboardSourceRows(
  supabase: AppDbClient,
  dashboardId: string,
  dashboard: { etl_id?: string | null; client_id?: string | null }
): Promise<SourceRow[]> {
  const { data: existing } = await supabase
    .from("dashboard_data_sources")
    .select("id, etl_id, alias, sort_order")
    .eq("dashboard_id", dashboardId)
    .order("sort_order", { ascending: true });

  if (existing && existing.length > 0) {
    return existing as SourceRow[];
  }

  const etlIds: string[] = [];
  if (dashboard.etl_id) etlIds.push(String(dashboard.etl_id));

  if (shouldUseOwnBackend()) {
    const admin = createServiceRoleClient();
    if (admin._sql) {
      const linked = await admin._sql<{ id: string }[]>`
        SELECT id FROM public.etl
        WHERE layout->>'linked_dashboard_id' = ${dashboardId}
      `;
      for (const row of linked) {
        const id = String(row.id);
        if (!etlIds.includes(id)) etlIds.push(id);
      }

      if (etlIds.length === 0 && dashboard.client_id) {
        const fromClient = await admin._sql<{ id: string }[]>`
          SELECT e.id
          FROM public.etl e
          WHERE e.client_id = ${String(dashboard.client_id)}
            AND EXISTS (
              SELECT 1 FROM public.etl_runs_log r
              WHERE r.etl_id = e.id AND r.status = 'completed'
            )
          ORDER BY (
            SELECT MAX(r2.completed_at)
            FROM public.etl_runs_log r2
            WHERE r2.etl_id = e.id AND r2.status = 'completed'
          ) DESC NULLS LAST
          LIMIT 5
        `;
        for (const row of fromClient) {
          const id = String(row.id);
          if (!etlIds.includes(id)) etlIds.push(id);
        }
      }
    }
  }

  if (etlIds.length === 0) return [];

  const admin = createServiceRoleClient();
  const rows: SourceRow[] = [];

  for (let i = 0; i < etlIds.length; i++) {
    const etl_id = etlIds[i];
    const res = await admin
      .from("dashboard_data_sources")
      .insert({
        dashboard_id: dashboardId,
        etl_id,
        alias: i === 0 ? "Principal" : `Fuente ${i + 1}`,
        sort_order: i,
      })
      .select("id, etl_id, alias, sort_order")
      .single();
    const inserted = res.data as SourceRow | null;
    if (inserted?.id) rows.push(inserted);
  }

  if (rows.length > 0 && !dashboard.etl_id) {
    await admin
      .from("dashboard")
      .update({ etl_id: rows[0].etl_id })
      .eq("id", dashboardId);
    dashboard.etl_id = rows[0].etl_id;
  }

  return rows;
}

export async function loadDashboardEtlContext(
  supabase: AppDbClient,
  dashboard: Record<string, unknown> & { id: string; etl_id?: string | null; layout?: unknown }
): Promise<LoadDashboardEtlContextResult | { error: string; status: number }> {
  const dashboardId = dashboard.id;

  let sourceRows = await ensureDashboardSourceRows(supabase, dashboardId, {
    etl_id: dashboard.etl_id,
    client_id: dashboard.client_id as string | null | undefined,
  });

  if (sourceRows.length === 0 && dashboard.etl_id) {
    sourceRows = [
      { id: "primary", etl_id: String(dashboard.etl_id), alias: "Principal", sort_order: 0 },
    ];
  }

  if (sourceRows.length === 0) {
    return {
      error:
        "Dashboard no tiene fuentes de datos (ETL) asociadas. Editá el dashboard y agregá al menos un ETL, o creá uno nuevo desde Métricas del ETL.",
      status: 400,
    };
  }

  const dataSources: DashboardEtlDataSource[] = [];
  let firstEtl: { id: string; title: string; name: string } | null = null;
  let firstEtlData: { name: string; rowCount: number; created_at: string | null } | null = null;
  let firstFields: ReturnType<typeof deriveFieldsFromSample> | null = null;
  const sourceInputs: DashboardSourceInput[] = [];

  for (const row of sourceRows) {
    const resolved = await resolveEtlToTableAndFields(supabase, row.etl_id);
    if (!resolved || resolved.rowCount === 0) continue;

    let sampleForFields = resolved.sampleData;
    if (sampleForFields.length === 0 && resolved.rowCount > 0 && shouldUseOwnBackend()) {
      const admin = createServiceRoleClient();
      if (admin._sql) {
        const safeSchema = resolved.schema.replace(/"/g, '""');
        const safeTable = resolved.tableName.replace(/"/g, '""');
        const rows = await admin._sql.unsafe<Record<string, unknown>[]>(
          `SELECT * FROM "${safeSchema}"."${safeTable}" LIMIT 1`
        );
        sampleForFields = rows ?? [];
      }
    }
    if (sampleForFields.length === 0) continue;

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
    const fields = deriveFieldsFromSample(sampleForFields);
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
  supabase: AppDbClient,
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
