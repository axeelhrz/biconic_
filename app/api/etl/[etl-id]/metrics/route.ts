import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  return supabase.auth.getUser().then(({ data: { user }, error }) => {
    if (error || !user) return { ok: false as const, status: 401, error: "No autorizado" };
    return supabase.from("profiles").select("app_role").eq("id", user.id).single().then(({ data: profile }) => {
      if ((profile as { app_role?: string })?.app_role !== "APP_ADMIN")
        return { ok: false as const, status: 403, error: "Requiere rol de administrador" };
      return { ok: true as const };
    });
  });
}

/**
 * GET /api/etl/[etl-id]/metrics
 * Devuelve las métricas guardadas del ETL (etl.layout.saved_metrics).
 * Requiere APP_ADMIN.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "etl-id": string }> }
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const awaitedParams = await params;
    const etlId = awaitedParams["etl-id"];
    if (!etlId) {
      return NextResponse.json({ ok: false, error: "etl-id requerido" }, { status: 400 });
    }

    const { data: etlRow, error } = await supabase
      .from("etl")
      .select("layout")
      .eq("id", etlId)
      .maybeSingle();

    if (error || !etlRow) {
      return NextResponse.json({ ok: false, error: "ETL no encontrado" }, { status: 404 });
    }

    const layout = etlRow.layout as {
      saved_metrics?: unknown[];
      dataset_config?: {
        derivedColumns?: { name: string; expression: string; defaultAggregation?: string }[];
        derived_columns?: { name: string; expression: string; default_aggregation?: string }[];
      };
    } | undefined;
    const savedMetrics = Array.isArray(layout?.saved_metrics) ? layout.saved_metrics : [];
    const datasetConfig = layout?.dataset_config && typeof layout.dataset_config === "object" ? layout.dataset_config : undefined;
    const rawDerived = datasetConfig?.derivedColumns ?? datasetConfig?.derived_columns;
    const derivedColumns = Array.isArray(rawDerived)
      ? rawDerived.map((d) => ({
          name: d.name,
          expression: d.expression,
          defaultAggregation: (d as { defaultAggregation?: string }).defaultAggregation ?? (d as { default_aggregation?: string }).default_aggregation ?? "SUM",
        }))
      : undefined;

    const linkedDashboardId = (layout as any)?.linked_dashboard_id ?? null;
    const dashboardFilters = Array.isArray((layout as any)?.dashboard_filters) ? (layout as any).dashboard_filters : [];

    return NextResponse.json({
      ok: true,
      data: {
        savedMetrics,
        ...(derivedColumns != null && { datasetConfig: { derivedColumns } }),
        linkedDashboardId,
        dashboardFilters,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al obtener métricas";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * PUT /api/etl/[etl-id]/metrics
 * Actualiza las métricas guardadas del ETL (etl.layout.saved_metrics).
 * Body: { savedMetrics: Array<{ id: string; name: string; metric: object }> }
 * Requiere APP_ADMIN.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ "etl-id": string }> }
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const awaitedParams = await params;
    const etlId = awaitedParams["etl-id"];
    if (!etlId) {
      return NextResponse.json({ ok: false, error: "etl-id requerido" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const savedMetrics = Array.isArray(body.savedMetrics) ? body.savedMetrics : [];
    const dateColumnPeriodicityOverrides =
      body.dateColumnPeriodicityOverrides != null && typeof body.dateColumnPeriodicityOverrides === "object"
        ? (body.dateColumnPeriodicityOverrides as Record<string, string>)
        : undefined;
    const datasetConfig =
      body.datasetConfig != null && typeof body.datasetConfig === "object"
        ? (body.datasetConfig as Record<string, unknown>)
        : undefined;
    const linkedDashboardId = typeof body.dashboardId === "string" ? body.dashboardId : undefined;
    const dashboardFilters = Array.isArray(body.dashboardFilters) ? body.dashboardFilters : undefined;

    const adminClient = createServiceRoleClient();
    const { data: etlRow, error: fetchError } = await adminClient
      .from("etl")
      .select("layout")
      .eq("id", etlId)
      .single();

    if (fetchError || !etlRow) {
      return NextResponse.json({ ok: false, error: "ETL no encontrado" }, { status: 404 });
    }

    const currentLayout = (etlRow as { layout?: Record<string, unknown> })?.layout ?? {};
    const updatedLayout = {
      ...currentLayout,
      saved_metrics: JSON.parse(JSON.stringify(savedMetrics)),
      ...(dateColumnPeriodicityOverrides !== undefined && { date_column_periodicity_overrides: dateColumnPeriodicityOverrides }),
      ...(datasetConfig !== undefined && { dataset_config: JSON.parse(JSON.stringify(datasetConfig)) }),
      ...(linkedDashboardId !== undefined && { linked_dashboard_id: linkedDashboardId }),
      ...(dashboardFilters !== undefined && { dashboard_filters: JSON.parse(JSON.stringify(dashboardFilters)) }),
    };

    const { error: updateError } = await adminClient
      .from("etl")
      .update({ layout: updatedLayout })
      .eq("id", etlId);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    // Propagar métricas actualizadas a dashboards que usan este ETL
    if (savedMetrics.length > 0) {
      await propagateMetricsToDashboards(adminClient, etlId, savedMetrics);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al guardar métricas";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

type SavedMetricPayload = {
  id?: string;
  name?: string;
  metric?: Record<string, unknown>;
  aggregationConfig?: Record<string, unknown>;
};

/**
 * Obtiene los dashboard_id que usan el ETL (por etl_id o por dashboard_data_sources).
 */
async function getDashboardIdsForEtl(
  adminClient: Awaited<ReturnType<typeof createServiceRoleClient>>,
  etlId: string
): Promise<string[]> {
  const ids = new Set<string>();

  const { data: byEtlId } = await adminClient
    .from("dashboard")
    .select("id")
    .eq("etl_id", etlId);
  if (Array.isArray(byEtlId)) {
    byEtlId.forEach((r: { id: string }) => ids.add(r.id));
  }

  const { data: bySources } = await adminClient
    .from("dashboard_data_sources")
    .select("dashboard_id")
    .eq("etl_id", etlId);
  if (Array.isArray(bySources)) {
    bySources.forEach((r: { dashboard_id: string }) => ids.add(r.dashboard_id));
  }

  return Array.from(ids);
}

/**
 * Construye aggregationConfig de un widget a partir de una métrica guardada (mismo formato que syncMetricsToDashboard).
 */
function buildWidgetAggregationConfig(m: SavedMetricPayload): Record<string, unknown> {
  const cfg = (m.aggregationConfig ?? {}) as Record<string, unknown>;
  const metricsArr = Array.isArray(cfg.metrics) ? cfg.metrics : (m.metric ? [m.metric] : []);
  return {
    enabled: true,
    dimension: cfg.dimension,
    dimension2: cfg.dimension2,
    dimensions: Array.isArray(cfg.dimensions) ? cfg.dimensions : undefined,
    metrics: metricsArr.map((met: Record<string, unknown>, idx: number) => {
      const base: Record<string, unknown> = {
        id: met.id ?? `m-${idx}`,
        field: met.field ?? "",
        func: met.func ?? "SUM",
        alias: met.alias ?? "",
        condition: met.condition,
        formula: met.formula,
      };
      if (met.expression && String(met.expression).trim()) base.expression = String(met.expression).trim();
      return base;
    }),
    filters: cfg.filters,
    orderBy: cfg.orderBy,
    limit: cfg.limit ?? 100,
    cumulative: cfg.cumulative,
    comparePeriod: cfg.comparePeriod,
    dateDimension: cfg.dateDimension,
    chartType: cfg.chartType,
    chartXAxis: cfg.chartXAxis,
    chartYAxes: cfg.chartYAxes,
    chartSeriesField: cfg.chartSeriesField,
    chartValueType: cfg.chartValueType,
    chartValueScale: cfg.chartValueScale,
    chartNumberFormat: cfg.chartNumberFormat,
    chartCurrencySymbol: cfg.chartCurrencySymbol,
    chartSeriesColors: cfg.chartSeriesColors,
    chartRankingEnabled: cfg.chartRankingEnabled,
    chartRankingTop: cfg.chartRankingTop,
    chartRankingMetric: cfg.chartRankingMetric,
  };
}

/**
 * Propaga las métricas actualizadas del ETL a todos los dashboards que usan ese ETL.
 * Actualiza layout.savedMetrics (por id o name) y los widgets que referencian la métrica (metricId o field por nombre).
 */
async function propagateMetricsToDashboards(
  adminClient: Awaited<ReturnType<typeof createServiceRoleClient>>,
  etlId: string,
  savedMetrics: SavedMetricPayload[]
): Promise<void> {
  const dashboardIds = await getDashboardIdsForEtl(adminClient, etlId);
  if (dashboardIds.length === 0) return;

  const byId = new Map<string, SavedMetricPayload>();
  const byNameLower = new Map<string, SavedMetricPayload>();
  for (const m of savedMetrics) {
    const id = typeof m.id === "string" ? m.id.trim() : "";
    const name = typeof m.name === "string" ? String(m.name).trim().toLowerCase() : "";
    if (id) byId.set(id, m);
    if (name) byNameLower.set(name, m);
  }

  for (const dashboardId of dashboardIds) {
    try {
      const { data: dashboard, error: fetchErr } = await adminClient
        .from("dashboard")
        .select("id, layout")
        .eq("id", dashboardId)
        .maybeSingle();

      if (fetchErr || !dashboard?.layout || typeof dashboard.layout !== "object") continue;

      const layout = dashboard.layout as {
        savedMetrics?: unknown[];
        widgets?: unknown[];
        theme?: unknown;
        pages?: unknown;
        activePageId?: unknown;
        datasetConfig?: unknown;
      };
      const currentSaved = Array.isArray(layout.savedMetrics) ? layout.savedMetrics : [];
      const currentWidgets = Array.isArray(layout.widgets) ? layout.widgets : [];

      let savedChanged = false;
      const nextSavedMetrics = currentSaved.map((item: unknown) => {
        const cur = item as { id?: string; name?: string };
        const curId = typeof cur.id === "string" ? cur.id.trim() : "";
        const curName = typeof cur.name === "string" ? String(cur.name).trim().toLowerCase() : "";
        const updated = curId ? byId.get(curId) : curName ? byNameLower.get(curName) : undefined;
        if (updated) {
          savedChanged = true;
          return JSON.parse(JSON.stringify(updated));
        }
        return item;
      });

      let widgetsChanged = false;
      const nextWidgets = currentWidgets.map((w: unknown) => {
        const widget = w as { metricId?: string; aggregationConfig?: { metrics?: { field?: string }[] }; id?: string; type?: string; title?: string; x?: number; y?: number; w?: number; h?: number; gridOrder?: number; gridSpan?: number; pageId?: string };
        const metricId = typeof widget.metricId === "string" ? widget.metricId.trim() : "";
        const updatedMetric = metricId ? byId.get(metricId) : undefined;
        if (updatedMetric) {
          widgetsChanged = true;
          const newAgg = buildWidgetAggregationConfig(updatedMetric);
          return {
            ...widget,
            title: updatedMetric.name ?? widget.title,
            aggregationConfig: newAgg,
          };
        }
        const agg = widget.aggregationConfig;
        const metricsArr = Array.isArray(agg?.metrics) ? agg.metrics : [];
        let metricEntryUpdated = false;
        const newMetrics = metricsArr.map((met: { field?: string; [k: string]: unknown }) => {
          const fieldStr = typeof met.field === "string" ? String(met.field).trim().toLowerCase() : "";
          const byName = fieldStr ? byNameLower.get(fieldStr) : undefined;
          if (byName?.metric) {
            metricEntryUpdated = true;
            const mt = byName.metric as Record<string, unknown>;
            return {
              id: met.id ?? mt.id,
              field: mt.field ?? met.field,
              func: mt.func ?? met.func,
              alias: mt.alias ?? met.alias,
              condition: mt.condition ?? met.condition,
              formula: mt.formula ?? met.formula,
              ...(mt.expression != null && { expression: mt.expression }),
            };
          }
          return met;
        });
        if (metricEntryUpdated) {
          widgetsChanged = true;
          return {
            ...widget,
            aggregationConfig: { ...agg, metrics: newMetrics },
          };
        }
        return w;
      });

      if (!savedChanged && !widgetsChanged) continue;

      const updatedLayout = {
        ...layout,
        savedMetrics: nextSavedMetrics,
        widgets: nextWidgets,
      };

      const { error: updateErr } = await adminClient
        .from("dashboard")
        .update({ layout: updatedLayout })
        .eq("id", dashboardId);

      if (updateErr) {
        console.error(`[metrics] No se pudo actualizar dashboard ${dashboardId}:`, updateErr.message);
      }
    } catch (err) {
      console.error(`[metrics] Error propagando a dashboard ${dashboardId}:`, err);
    }
  }
}

/**
 * DELETE /api/etl/[etl-id]/metrics
 * Body: { metricId: string }
 * Elimina una métrica del ETL (la quita de layout.saved_metrics).
 * Requiere APP_ADMIN.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ "etl-id": string }> }
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const awaitedParams = await params;
    const etlId = awaitedParams["etl-id"];
    if (!etlId) {
      return NextResponse.json({ ok: false, error: "etl-id requerido" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const metricId = typeof body.metricId === "string" ? body.metricId.trim() : "";
    if (!metricId) {
      return NextResponse.json({ ok: false, error: "metricId requerido en el body" }, { status: 400 });
    }

    const adminClient = createServiceRoleClient();
    const { data: etlRow, error: fetchError } = await adminClient
      .from("etl")
      .select("layout")
      .eq("id", etlId)
      .single();

    if (fetchError || !etlRow) {
      return NextResponse.json({ ok: false, error: "ETL no encontrado" }, { status: 404 });
    }

    const currentLayout = (etlRow as { layout?: { saved_metrics?: { id?: string }[] } })?.layout ?? {};
    const savedMetrics = Array.isArray(currentLayout.saved_metrics) ? currentLayout.saved_metrics : [];
    const updated = savedMetrics.filter((m) => (m as { id?: string }).id !== metricId);
    if (updated.length === savedMetrics.length) {
      return NextResponse.json({ ok: false, error: "Métrica no encontrada" }, { status: 404 });
    }

    const updatedLayout = {
      ...currentLayout,
      saved_metrics: updated,
    };

    const { error: updateError } = await adminClient
      .from("etl")
      .update({ layout: updatedLayout })
      .eq("id", etlId);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al eliminar métrica";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
