"use client";

import { Label } from "@/components/ui/label";
import {
  CHART_QUICK_CALC_OPTIONS,
  normalizeChartQuickCalc,
  type ChartQuickCalc,
} from "@/lib/dashboard/chartQuickCalcTypes";

type Props = {
  value?: ChartQuickCalc | string;
  onChange: (value: ChartQuickCalc) => void;
  groupField?: string;
  onGroupFieldChange?: (field: string | undefined) => void;
  columnOptions?: string[];
  labelClassName?: string;
  selectClassName?: string;
  hintClassName?: string;
};

export default function ChartQuickCalcFields({
  value,
  onChange,
  groupField,
  onGroupFieldChange,
  columnOptions = [],
  labelClassName = "text-sm font-medium mb-1 block",
  selectClassName = "w-full h-9 rounded-lg border px-3 text-sm",
  hintClassName = "text-xs mt-1",
}: Props) {
  const mode = normalizeChartQuickCalc(value);
  const selected = CHART_QUICK_CALC_OPTIONS.find((o) => o.value === mode);

  return (
    <div className="space-y-3">
      <div>
        <Label className={labelClassName}>Cálculo rápido</Label>
        <p className={hintClassName} style={{ color: "var(--platform-fg-muted, var(--studio-fg-muted))" }}>
          Transforma los valores mostrados en el gráfico sin cambiar el análisis subyacente.
        </p>
        <select
          value={mode}
          onChange={(e) => onChange(e.target.value as ChartQuickCalc)}
          className={selectClassName}
          style={{
            borderColor: "var(--platform-border, var(--studio-border))",
            backgroundColor: "var(--platform-bg, var(--studio-surface))",
            color: "var(--platform-fg, var(--studio-fg))",
          }}
        >
          {CHART_QUICK_CALC_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {selected?.hint ? (
          <p className={hintClassName} style={{ color: "var(--platform-fg-muted, var(--studio-fg-muted))" }}>
            {selected.hint}
          </p>
        ) : null}
      </div>
      {mode === "percent_dimension" && onGroupFieldChange ? (
        <div>
          <Label className={labelClassName}>Dimensión de agrupación</Label>
          <select
            value={groupField ?? ""}
            onChange={(e) => onGroupFieldChange(e.target.value ? e.target.value : undefined)}
            className={selectClassName}
            style={{
              borderColor: "var(--platform-border, var(--studio-border))",
              backgroundColor: "var(--platform-bg, var(--studio-surface))",
              color: "var(--platform-fg, var(--studio-fg))",
            }}
          >
            <option value="">Elegir columna…</option>
            {columnOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
