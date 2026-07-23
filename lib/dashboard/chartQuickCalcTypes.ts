import type { ChartPercentBasis } from "@/lib/dashboard/chartOptions";

export type ChartQuickCalc =
  | "none"
  | "percent_total"
  | "percent_category"
  | "percent_series"
  | "percent_dimension"
  | "vs_average"
  | "vs_max"
  | "vs_min";

export const CHART_QUICK_CALC_OPTIONS: { value: ChartQuickCalc; label: string; hint?: string }[] = [
  { value: "none", label: "Sin cálculo (valor original)" },
  { value: "percent_total", label: "% del total visible", hint: "Cada valor dividido por la suma de todo lo visible." },
  { value: "percent_category", label: "% de la categoría (eje X)", hint: "Dentro de cada categoría del eje, la suma es 100%." },
  { value: "percent_series", label: "% de la serie", hint: "Dentro de cada serie o leyenda, la suma es 100%." },
  { value: "percent_dimension", label: "% del grupo / dimensión", hint: "Agrupa por la dimensión elegida abajo." },
  { value: "vs_average", label: "Índice vs promedio (100 = promedio)", hint: "Valor ÷ promedio × 100." },
  { value: "vs_max", label: "% del máximo", hint: "Valor ÷ máximo visible × 100." },
  { value: "vs_min", label: "% del mínimo", hint: "Valor ÷ mínimo visible × 100." },
];

export function normalizeChartQuickCalc(v?: unknown): ChartQuickCalc {
  const s = String(v ?? "").trim();
  if (CHART_QUICK_CALC_OPTIONS.some((o) => o.value === s)) return s as ChartQuickCalc;
  return "none";
}

export function chartQuickCalcUsesPercentDisplay(mode: ChartQuickCalc): boolean {
  return (
    mode === "percent_total" ||
    mode === "percent_category" ||
    mode === "percent_series" ||
    mode === "percent_dimension"
  );
}

export function chartQuickCalcToPercentBasis(mode: ChartQuickCalc): ChartPercentBasis | undefined {
  switch (mode) {
    case "percent_total":
      return "chart_visible_total";
    case "percent_category":
      return "per_category_axis";
    case "percent_series":
      return "per_series";
    case "percent_dimension":
      return "per_dimension_group";
    default:
      return undefined;
  }
}
