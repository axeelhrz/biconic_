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
import { resolveSavedArtifacts } from "@/lib/dashboard/datasetSavedArtifacts";

export type DashboardEtlDataSource = {
  id: string;
  etlId: string;
  /** Dataset vinculado (fuente semántica). Null solo en fuentes legacy. */
  datasetId: string | null;
  alias: string;
  etlName: string;
  datasetName: string | null;
  schema: string;
  tableName: string;
  rowCount: number;
  fields: ReturnType<typeof deriveFieldsFromSample>;
  savedMetrics: unknown[];
  savedAnalyses: unknown[];
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

type SourceRow = {
  id: string;
  etl_id: string;
  dataset_id: string | null;
  alias: string;
  sort_order: number;
};

function parseBoundDatasetIds(layout: unknown): string[] {
  if (!layout || typeof layout !== "object") return [];
  const l = layout as { boundDatasetIds?: unknown; boundDatasetId?: unknown };
  const fromArr = Array.isArray(l.boundDatasetIds)
    ? l.boundDatasetIds.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (fromArr.length > 0) return fromArr;
  const one = typeof l.boundDatasetId === "string" ? l.boundDatasetId.trim() : "";
  return one ? [one] : [];
}

/** Repara dashboards sin filas en dashboard_data_sources (migración / creación incompleta). */
async function ensureDashboardSourceRows(
  supabase: AppDbClient,
  dashboardId: string,
  dashboard: { etl_id?: string | null; client_id?: string | null; layout?: unknown }
): Promise<SourceRow[]> {
  const { data: existing } = await supabase
    .from("dashboard_data_sources")
    .select("id, etl_id, dataset_id, alias, sort_order")
    .eq("dashboard_id", dashboardId)
    .order("sort_order", { ascending: true });

  if (existing && existing.length > 0) {
    const rows = existing as SourceRow[];
    const missing = rows.filter((r) => !r.dataset_id);
    const boundIds = parseBoundDatasetIds(dashboard.layout);
    if (missing.length > 0 && boundIds.length > 0) {
      const admin = createServiceRoleClient();
      const { data: dsRows } = await admin
        .from("dataset")
        .select("id, etl_id, name")
        .in("id", boundIds);
      const byEtl = new Map<string, { id: string; name: string | null }[]>();
      for (const d of Array.isArray(dsRows) ? dsRows : []) {
        const etlId = String(d.etl_id ?? "");
        const list = byEtl.get(etlId) ?? [];
        list.push({ id: String(d.id), name: (d as { name?: string | null }).name ?? null });
        byEtl.set(etlId, list);
      }
      for (const row of missing) {
        const candidates = byEtl.get(String(row.etl_id)) ?? [];
        const pick = candidates.find((c) => boundIds.includes(c.id)) ?? candidates[0];
        if (!pick) continue;
        await admin
          .from("dashboard_data_sources")
          .update({
            dataset_id: pick.id,
            ...(row.alias === "Principal" || row.alias.startsWith("Fuente")
              ? { alias: String(pick.name ?? "").trim() || row.alias }
              : {}),
          })
          .eq("id", row.id);
        row.dataset_id = pick.id;
      }
    }
    return rows;
  }

  const boundIds = parseBoundDatasetIds(dashboard.layout);
  const admin = createServiceRoleClient();

  if (boundIds.length > 0) {
    const { data: dsRows } = await admin
      .from("dataset")
      .select("id, etl_id, name")
      .in("id", boundIds);
    const datasets = Array.isArray(dsRows) ? dsRows : [];
    const ordered = boundIds
      .map((id) => datasets.find((d) => String(d.id) === id))
      .filter((d): d is (typeof datasets)[number] => !!d);
    const rows: SourceRow[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const ds = ordered[i]!;
      const res = await admin
        .from("dashboard_data_sources")
        .insert({
          dashboard_id: dashboardId,
          etl_id: String(ds.etl_id),
          dataset_id: String(ds.id),
          alias: String(ds.name ?? "").trim() || (i === 0 ? "Principal" : `Fuente ${i + 1}`),
          sort_order: i,
        })
        .select("id, etl_id, dataset_id, alias, sort_order")
        .single();
      const inserted = res.data as SourceRow | null;
      if (inserted?.id) rows.push(inserted);
    }
    if (rows.length > 0 && !dashboard.etl_id) {
      await admin.from("dashboard").update({ etl_id: rows[0].etl_id }).eq("id", dashboardId);
      dashboard.etl_id = rows[0].etl_id;
    }
    return rows;
  }

  const etlIds: string[] = [];
  if (dashboard.etl_id) etlIds.push(String(dashboard.etl_id));

  if (shouldUseOwnBackend() && admin._sql) {
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

  if (etlIds.length === 0) return [];

  const rows: SourceRow[] = [];

  for (let i = 0; i < etlIds.length; i++) {
    const etl_id = etlIds[i]!;
    const { data: dsForEtl } = await admin
      .from("dataset")
      .select("id, name")
      .eq("etl_id", etl_id)
      .order("updated_at", { ascending: false })
      .limit(2);
    const dsList = Array.isArray(dsForEtl) ? dsForEtl : [];
    const sole = dsList.length === 1 ? dsList[0] : null;

    const res = await admin
      .from("dashboard_data_sources")
      .insert({
        dashboard_id: dashboardId,
        etl_id,
        ...(sole ? { dataset_id: String(sole.id) } : {}),
        alias: sole
          ? String((sole as { name?: string }).name ?? "").trim() ||
            (i === 0 ? "Principal" : `Fuente ${i + 1}`)
          : i === 0
            ? "Principal"
            : `Fuente ${i + 1}`,
        sort_order: i,
      })
      .select("id, etl_id, dataset_id, alias, sort_order")
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
    layout: dashboard.layout,
  });

  if (sourceRows.length === 0 && dashboard.etl_id) {
    sourceRows = [
      {
        id: "primary",
        etl_id: String(dashboard.etl_id),
        dataset_id: null,
        alias: "Principal",
        sort_order: 0,
      },
    ];
  }

  if (sourceRows.length === 0) {
    return {
      error:
        "Dashboard no tiene datasets asociados. Editá el dashboard y agregá al menos un dataset.",
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

    let datasetConfig: unknown = null;
    let datasetName: string | null = null;
    if (row.dataset_id) {
      const { data: dsRow } = await supabase
        .from("dataset")
        .select("id, name, config")
        .eq("id", row.dataset_id)
        .maybeSingle();
      if (dsRow) {
        datasetConfig = (dsRow as { config?: unknown }).config ?? null;
        datasetName = String((dsRow as { name?: string | null }).name ?? "").trim() || null;
      }
    }

    const etlName =
      datasetName ||
      (etlRow as { title?: string; name?: string } | null)?.title ||
      (etlRow as { title?: string; name?: string } | null)?.name ||
      row.alias;
    const layout = (etlRow as { layout?: unknown } | null)?.layout;
    const fields = deriveFieldsFromSample(sampleForFields);
    const { savedMetrics, savedAnalyses } = resolveSavedArtifacts({
      datasetConfig,
      etlLayout: layout,
    });

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
      datasetId: row.dataset_id,
      alias: row.alias,
      etlName,
      datasetName,
      schema: resolved.schema,
      tableName: resolved.tableName,
      rowCount: resolved.rowCount,
      fields,
      savedMetrics,
      savedAnalyses,
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
    return { error: "No se encontraron datos en ninguna fuente del dataset", status: 404 };
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
