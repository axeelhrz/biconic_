import type { AggregationMetricEdit } from "@/components/admin/dashboard/AddMetricConfigForm";

export type SavedMetricForExpand = {
  id?: string;
  name?: string;
  metric?: AggregationMetricEdit;
  aggregationConfig?: { metrics?: AggregationMetricEdit[] };
};

export type ExpandSavedMetricsOptions = {
  setDisplayAliasToSavedName?: boolean;
};

export function rewriteFormulaMetricRefs(formula: string, localCount: number, globalStartIndex: number): string {
  return formula.replace(/metric_(\d+)\b/gi, (_match, rawIndex: string) => {
    const localIndex = Number.parseInt(rawIndex, 10);
    if (!Number.isFinite(localIndex) || localIndex < 0 || localIndex >= localCount) return _match;
    return `metric_${globalStartIndex + localIndex}`;
  });
}

/**
 * Expande las tarjetas de métricas guardadas en una sola lista para `/api/dashboard/aggregate-data`,
 * reescribiendo `metric_i` en fórmulas según el índice global (mismo criterio que el wizard de Análisis en ETL).
 */
export function expandSavedMetricsWithGlobalRefs(
  selectedMetricIds: string[],
  savedMetrics: SavedMetricForExpand[],
  options?: ExpandSavedMetricsOptions
): AggregationMetricEdit[] {
  const selected = selectedMetricIds
    .map((id) => savedMetrics.find((s) => String(s.id) === String(id)))
    .filter((s): s is SavedMetricForExpand => s != null);
  const out: AggregationMetricEdit[] = [];
  const norm = (value: string) => (value || "").trim().toLowerCase();

  for (const saved of selected) {
    const cfg = saved.aggregationConfig;
    const list = cfg?.metrics?.length ? cfg.metrics : saved.metric ? [saved.metric] : [];
    if (list.length === 0) continue;
    const globalStart = out.length;
    const savedName = String(saved.name || "").trim();
    const resultIdx = list.findIndex((m) => norm(m.alias ?? "") === norm(savedName));
    const displayIdx = resultIdx >= 0 ? resultIdx : list.length - 1;

    for (let i = 0; i < list.length; i++) {
      const metric = { ...list[i]!, id: list[i]!.id ?? `${saved.id}-${i}` };
      if (options?.setDisplayAliasToSavedName && i === displayIdx && savedName) {
        metric.alias = savedName;
      }
      const formula = metric.formula?.trim();
      if (formula) {
        metric.formula = rewriteFormulaMetricRefs(formula, list.length, globalStart);
      }
      out.push(metric);
    }
  }

  return out;
}
