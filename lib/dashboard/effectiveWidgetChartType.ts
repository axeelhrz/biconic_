/**
 * Tipo visual efectivo del widget: misma regla que `DashboardWidgetRenderer` (useMemo chartType).
 * Centralizado para que `loadPreviewWidgetData` no clasifique mal tablas cuando `chartType` viene "".
 */
export function effectiveWidgetChartType(widget: {
  type?: string;
  aggregationConfig?: { chartType?: string } | null;
}): string {
  const nodeType = String(widget.type ?? "").trim();
  if (nodeType === "filter" || nodeType === "text" || nodeType === "image" || nodeType === "map") {
    return nodeType;
  }
  const aggType = String(widget.aggregationConfig?.chartType ?? "").trim();
  const resolved = (aggType || nodeType || "bar").trim();
  return resolved || "bar";
}
