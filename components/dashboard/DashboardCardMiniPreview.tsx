"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, Doughnut, Line, Pie, Scatter } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Loader2 } from "lucide-react";
import { safeJsonResponse } from "@/lib/safe-json-response";
import { buildChartConfig, getProcessedRowsForChart, type ChartConfig } from "@/lib/dashboard/buildChartConfig";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

type AggregationMetric = {
  id?: string;
  field?: string;
  func?: string;
  alias?: string;
  expression?: string;
  condition?: unknown;
  formula?: string;
};

type AggregationConfig = {
  enabled?: boolean;
  dimension?: string;
  dimensions?: string[];
  dimension2?: string;
  metrics?: AggregationMetric[];
  filters?: Array<{ field?: string; operator?: string; value?: unknown }>;
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  cumulative?: "none" | "running_sum" | "ytd";
  comparePeriod?: "previous_year" | "previous_month";
  dateDimension?: string;
  dateGroupByGranularity?: "day" | "week" | "month" | "quarter" | "semester" | "year";
  dateRangeFilter?: { field: string; last?: number; unit?: "days" | "months"; from?: string; to?: string };
  chartType?: string;
  chartXAxis?: string;
  chartYAxes?: string[];
  chartSeriesField?: string;
  chartRankingEnabled?: boolean;
  chartRankingTop?: number;
  chartRankingMetric?: string;
};

type LayoutWidget = {
  id?: string;
  title?: string;
  type?: string;
  pageId?: string;
  gridOrder?: number;
  gridSpan?: number;
  dataSourceId?: string | null;
  source?: { labelField?: string };
  aggregationConfig?: AggregationConfig;
};

type LayoutData = {
  widgets?: LayoutWidget[];
  pages?: Array<{ id: string; name?: string }>;
  activePageId?: string;
};

type DashboardDataSource = {
  id: string;
  etlId: string;
  schema: string;
  tableName: string;
  savedMetrics?: unknown[];
};

type EtlDataPayload = {
  dataSources?: DashboardDataSource[];
  primarySourceId?: string | null;
  datasetDimensions?: Record<string, Record<string, string>>;
};

type MiniWidgetData = {
  id: string;
  title: string;
  type: string;
  chartConfig?: ChartConfig;
  rows: Record<string, unknown>[];
  hasData: boolean;
  gridSpan: number;
};

const MINI_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: {
    x: { display: false, grid: { display: false } },
    y: { display: false, grid: { display: false } },
  },
};

const MINI_PIE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
};

function pickWidgets(layout: LayoutData): LayoutWidget[] {
  const widgets = Array.isArray(layout.widgets) ? layout.widgets : [];
  const activePageId = layout.activePageId ?? layout.pages?.[0]?.id;
  return [...widgets]
    .filter((w) => !activePageId || w.pageId === activePageId)
    .sort((a, b) => (a.gridOrder ?? 999) - (b.gridOrder ?? 999))
    .slice(0, 4);
}

function mapField(field: string | undefined, sourceId: string | undefined, datasetDimensions?: Record<string, Record<string, string>>): string | undefined {
  if (!field || !sourceId || !datasetDimensions) return field;
  return datasetDimensions[field]?.[sourceId] ?? field;
}

function buildSavedMetricsPayload(savedMetrics: unknown[] | undefined, metrics: AggregationMetric[] | undefined) {
  const metricFieldNames = new Set(
    (metrics ?? [])
      .filter((m) => (m.func ?? "").toUpperCase() !== "FORMULA" && (m.field ?? "").trim() !== "")
      .map((m) => String(m.field).trim().toLowerCase())
  );
  if (metricFieldNames.size === 0 || !Array.isArray(savedMetrics) || savedMetrics.length === 0) return [];

  return savedMetrics
    .map((item) => item as { name?: string; metric?: { field?: string; func?: string; alias?: string; expression?: string }; aggregationConfig?: { metrics?: Array<{ field?: string; func?: string; alias?: string; expression?: string }> } })
    .filter((s) => (s.name ?? "").trim() !== "" && metricFieldNames.has(String(s.name).trim().toLowerCase()))
    .map((s) => {
      const name = String(s.name).trim();
      const first = s.aggregationConfig?.metrics?.[0] ?? s.metric;
      if (!first) return { name, field: name, func: "SUM", alias: name };
      return {
        name,
        field: String(first.field ?? "").trim() || name,
        func: String(first.func ?? "SUM"),
        alias: String(first.alias ?? name),
        ...(first.expression ? { expression: String(first.expression).trim() } : {}),
      };
    });
}

async function loadWidgetData(
  dashboardId: string,
  widget: LayoutWidget,
  etlData: EtlDataPayload
): Promise<MiniWidgetData> {
  const type = widget.type ?? "bar";
  const id = widget.id ?? `w-${Math.random().toString(36).slice(2)}`;
  const title = widget.title ?? "Widget";
  const gridSpan = Math.min(2, Math.max(1, widget.gridSpan === 1 ? 1 : 2));
  const sources = etlData.dataSources ?? [];
  const sourceId = widget.dataSourceId ?? etlData.primarySourceId ?? sources[0]?.id;
  const source = sources.find((s) => s.id === sourceId) ?? sources[0];

  if (!source) {
    return { id, title, type, rows: [], hasData: false, gridSpan };
  }

  const tableName = `${source.schema}.${source.tableName}`;
  const agg = widget.aggregationConfig;
  const hasAgg = !!(agg?.enabled && (agg.metrics?.length ?? 0) > 0);

  let rows: Record<string, unknown>[] = [];
  if (hasAgg) {
    const dimensions = (agg?.dimensions?.length ? agg.dimensions : [agg?.dimension, agg?.dimension2].filter(Boolean)) as string[];
    const metricsPayload = (agg?.metrics ?? []).map((m) => ({
      ...m,
      field: mapField(m.field, sourceId ?? undefined, etlData.datasetDimensions),
    }));
    const savedMetrics = buildSavedMetricsPayload(source.savedMetrics, agg?.metrics);
    const payload = {
      tableName,
      etlId: source.etlId,
      dimension: mapField(agg?.dimension, sourceId ?? undefined, etlData.datasetDimensions),
      dimensions: dimensions.map((d) => mapField(d, sourceId ?? undefined, etlData.datasetDimensions)),
      metrics: metricsPayload,
      filters: agg?.filters ?? [],
      orderBy: agg?.chartRankingEnabled && (agg?.chartRankingTop ?? 0) > 0 && agg?.chartRankingMetric
        ? { field: agg.chartRankingMetric, direction: "DESC" as const }
        : agg?.orderBy,
      limit: Math.min(40, Math.max(5, agg?.limit ?? 40)),
      cumulative: agg?.cumulative ?? "none",
      comparePeriod: agg?.comparePeriod,
      dateDimension: mapField(agg?.dateDimension, sourceId ?? undefined, etlData.datasetDimensions),
      ...(agg?.dateGroupByGranularity && (dimensions[0] || agg?.dimension)
        ? {
            dateGroupBy: {
              field: mapField(dimensions[0] ?? agg?.dimension, sourceId ?? undefined, etlData.datasetDimensions),
              granularity: agg.dateGroupByGranularity,
            },
          }
        : {}),
      ...(agg?.dateRangeFilter ? { dateRangeFilter: agg.dateRangeFilter } : {}),
      ...(savedMetrics.length > 0 ? { savedMetrics } : {}),
    };

    const response = await fetch("/api/dashboard/aggregate-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await safeJsonResponse<{ rows?: Record<string, unknown>[] }>(response);
    if (!response.ok || !result.ok) throw new Error(result.error ?? "Error agregando datos");
    rows = Array.isArray(result) ? result : Array.isArray(result.rows) ? result.rows : [];
  } else {
    const response = await fetch("/api/dashboard/raw-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableName, limit: 60 }),
    });
    const result = await safeJsonResponse<{ rows?: Record<string, unknown>[] }>(response);
    if (!response.ok || !result.ok) throw new Error(result.error ?? "Error cargando datos");
    rows = Array.isArray(result) ? result : Array.isArray(result.rows) ? result.rows : [];
  }

  if (rows.length === 0) {
    return { id, title, type, rows: [], hasData: false, gridSpan };
  }

  const chartConfig = type === "table"
    ? undefined
    : buildChartConfig(rows, { type, aggregationConfig: agg, source: widget.source }, "#0ea5e9");
  const processedRows = type === "table"
    ? getProcessedRowsForChart(rows, { type, aggregationConfig: agg, source: widget.source })
    : rows;

  const hasChartData = type === "kpi"
    ? processedRows.length > 0
    : type === "table"
      ? processedRows.length > 0
      : !!(chartConfig?.labels?.length && (chartConfig.datasets?.length ?? 0) > 0);

  return {
    id,
    title,
    type,
    chartConfig: chartConfig ?? undefined,
    rows: processedRows,
    hasData: hasChartData,
    gridSpan,
  };
}

function MiniWidgetTile({ widget }: { widget: MiniWidgetData }) {
  const miniType = widget.type === "area" ? "line" : widget.type;

  if (!widget.hasData) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border text-[10px]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
        Sin datos
      </div>
    );
  }

  if (miniType === "kpi") {
    const firstRow = widget.rows[0] ?? {};
    const firstNumeric = Object.values(firstRow).find((v) => typeof v === "number") ?? Object.values(firstRow)[0];
    return (
      <div className="flex h-full items-center justify-center rounded-md border px-2 text-center" style={{ borderColor: "var(--platform-border)" }}>
        <span className="truncate text-xs font-semibold" style={{ color: "var(--platform-fg)" }}>
          {String(firstNumeric ?? "—")}
        </span>
      </div>
    );
  }

  if (miniType === "table") {
    const row = widget.rows[0] ?? {};
    return (
      <div className="h-full overflow-hidden rounded-md border p-1.5 text-[9px]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
        {Object.entries(row).slice(0, 2).map(([k, v]) => (
          <p key={k} className="truncate">{k}: {String(v ?? "")}</p>
        ))}
      </div>
    );
  }

  if (!widget.chartConfig) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border text-[10px]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
        Sin preview
      </div>
    );
  }

  return (
    <div className="h-full rounded-md border p-1" style={{ borderColor: "var(--platform-border)" }}>
      {miniType === "bar" && <Bar data={widget.chartConfig as never} options={MINI_CHART_OPTIONS as never} />}
      {miniType === "horizontalBar" && (
        <Bar
          data={widget.chartConfig as never}
          options={{ ...MINI_CHART_OPTIONS, indexAxis: "y" as const } as never}
        />
      )}
      {miniType === "line" && <Line data={widget.chartConfig as never} options={MINI_CHART_OPTIONS as never} />}
      {miniType === "combo" && <Bar data={widget.chartConfig as never} options={MINI_CHART_OPTIONS as never} />}
      {miniType === "pie" && <Pie data={widget.chartConfig as never} options={MINI_PIE_OPTIONS as never} />}
      {miniType === "doughnut" && <Doughnut data={widget.chartConfig as never} options={MINI_PIE_OPTIONS as never} />}
      {miniType === "scatter" && <Scatter data={widget.chartConfig as never} options={MINI_CHART_OPTIONS as never} />}
    </div>
  );
}

export function DashboardCardMiniPreview({ dashboardId, layout }: { dashboardId: string; layout: LayoutData }) {
  const [widgets, setWidgets] = useState<MiniWidgetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selectedWidgets = useMemo(() => pickWidgets(layout), [layout]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!isVisible || selectedWidgets.length === 0) {
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        setLoading(true);
        setFailed(false);
        const etlRes = await fetch(`/api/dashboard/${dashboardId}/etl-data`, { cache: "no-store" });
        const etlJson = await safeJsonResponse<{ data?: EtlDataPayload }>(etlRes);
        if (!etlRes.ok || !etlJson.ok || !etlJson.data) throw new Error(etlJson.error ?? "No se pudo cargar ETL");

        // Limita concurrencia para evitar saturar la grilla de tarjetas.
        const queue = [...selectedWidgets];
        const partial: MiniWidgetData[] = [];
        const workers = Array.from({ length: 2 }).map(async () => {
          while (queue.length > 0 && !cancelled) {
            const current = queue.shift();
            if (!current) break;
            try {
              const loaded = await loadWidgetData(dashboardId, current, etlJson.data!);
              partial.push(loaded);
            } catch {
              partial.push({
                id: current.id ?? `w-${Math.random().toString(36).slice(2)}`,
                title: current.title ?? "Widget",
                type: current.type ?? "bar",
                rows: [],
                hasData: false,
                gridSpan: current.gridSpan === 1 ? 1 : 2,
              });
            }
          }
        });

        await Promise.all(workers);
        if (!cancelled) {
          const ordered = selectedWidgets.map((w) => partial.find((p) => p.id === (w.id ?? ""))).filter(Boolean) as MiniWidgetData[];
          setWidgets(ordered);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [dashboardId, selectedWidgets, isVisible]);

  return (
    <div
      ref={ref}
      className="h-full w-full p-2"
      style={{ background: "var(--platform-bg-elevated)" }}
    >
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--platform-fg-muted)" }} />
        </div>
      ) : failed ? (
        <div className="flex h-full items-center justify-center text-[10px]" style={{ color: "var(--platform-fg-muted)" }}>
          Sin previsualizacion
        </div>
      ) : (
        <div className="grid h-full grid-cols-2 gap-1">
          {widgets.map((widget) => (
            <div
              key={widget.id}
              className={widget.gridSpan === 2 ? "col-span-2 min-h-0" : "col-span-1 min-h-0"}
            >
              <MiniWidgetTile widget={widget} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
