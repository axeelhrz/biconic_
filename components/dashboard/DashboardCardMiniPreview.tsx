"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { safeJsonResponse } from "@/lib/safe-json-response";
import { DashboardWidgetRenderer, type DashboardWidgetRendererWidget } from "@/components/dashboard/DashboardWidgetRenderer";
import { loadPreviewWidgetData } from "@/lib/dashboard/previewWidgetDataLoader";
import { buildChartMetricStyles, buildChartStyleFromAgg, resolveDarkChartTheme } from "@/lib/dashboard/widgetRenderParity";
import { mergeTheme, type DashboardTheme } from "@/types/dashboard";

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
  geoHints?: {
    countryField?: string;
    provinceField?: string;
    cityField?: string;
    addressField?: string;
    latField?: string;
    lonField?: string;
  };
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
  theme?: Partial<DashboardTheme>;
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
  rendererWidget: DashboardWidgetRendererWidget;
  hasData: boolean;
  gridSpan: number;
};

function pickWidgets(layout: LayoutData): LayoutWidget[] {
  const widgets = Array.isArray(layout.widgets) ? layout.widgets : [];
  const activePageId = layout.activePageId ?? layout.pages?.[0]?.id;
  return [...widgets]
    .filter((w) => !activePageId || w.pageId === activePageId)
    .sort((a, b) => (a.gridOrder ?? 999) - (b.gridOrder ?? 999))
    .slice(0, 4);
}

async function loadWidgetData(
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
    return {
      id,
      title,
      type,
      hasData: false,
      gridSpan,
      rendererWidget: {
        id,
        title,
        type: type as DashboardWidgetRendererWidget["type"],
      },
    };
  }

  const tableName = `${source.schema}.${source.tableName}`;
  const agg = widget.aggregationConfig;
  const loaded = await loadPreviewWidgetData({
    widget: { type, aggregationConfig: agg, source: widget.source },
    tableName,
    etlId: source.etlId,
    sourceId,
    datasetDimensions: etlData.datasetDimensions,
    savedMetrics: source.savedMetrics,
    rawLimit: 60,
    accentColor: "#0ea5e9",
  });

  return {
    id,
    title,
    type,
    rendererWidget: {
      id,
      title,
      type: type as DashboardWidgetRendererWidget["type"],
      config: loaded.chartConfig,
      rows: loaded.processedRows,
      aggregationConfig: agg,
      chartStyle: buildChartStyleFromAgg(agg),
      chartMetricStyles: buildChartMetricStyles(agg),
      labelDisplayMode: "percent",
    },
    hasData: loaded.hasData,
    gridSpan,
  };
}

function MiniWidgetTile({ widget, darkChartTheme }: { widget: MiniWidgetData; darkChartTheme: boolean }) {
  if (!widget.hasData) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border text-[10px]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
        Sin datos
      </div>
    );
  }

  return (
    <div className="h-full rounded-md border p-1" style={{ borderColor: "var(--platform-border)" }}>
      <DashboardWidgetRenderer
        widget={widget.rendererWidget}
        isLoading={false}
        hideHeader
        minHeight={130}
        darkChartTheme={darkChartTheme}
        className="!border-0 !p-0 !shadow-none h-full"
      />
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
  const darkChartTheme = useMemo(() => resolveDarkChartTheme(mergeTheme(layout.theme), true), [layout.theme]);

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
              const loaded = await loadWidgetData(current, etlJson.data!);
              partial.push(loaded);
            } catch {
              partial.push({
                id: current.id ?? `w-${Math.random().toString(36).slice(2)}`,
                title: current.title ?? "Widget",
                type: current.type ?? "bar",
                hasData: false,
                gridSpan: current.gridSpan === 1 ? 1 : 2,
                rendererWidget: {
                  id: current.id ?? `w-${Math.random().toString(36).slice(2)}`,
                  title: current.title ?? "Widget",
                  type: (current.type ?? "bar") as DashboardWidgetRendererWidget["type"],
                },
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
              <MiniWidgetTile widget={widget} darkChartTheme={darkChartTheme} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
