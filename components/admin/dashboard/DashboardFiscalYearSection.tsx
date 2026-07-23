"use client";

import {
  DEFAULT_FISCAL_YEAR_START_MONTH,
  FISCAL_YEAR_MONTH_OPTIONS,
  normalizeFiscalYearStartMonth,
} from "@/lib/dashboard/fiscalYear";
import { Label } from "@/components/ui/label";

export type DashboardFiscalYearSectionProps = {
  fiscalYearStartMonth: number | undefined;
  onChange: (month: number) => void;
};

export function DashboardFiscalYearSection({
  fiscalYearStartMonth,
  onChange,
}: DashboardFiscalYearSectionProps) {
  const value = normalizeFiscalYearStartMonth(fiscalYearStartMonth ?? DEFAULT_FISCAL_YEAR_START_MONTH);
  const isCalendarYear = value === 1;

  return (
    <div className="space-y-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] p-3">
      <Label className="text-xs font-semibold text-[var(--studio-fg)]">Año fiscal</Label>
      <p className="text-[11px] text-[var(--studio-fg-muted)]">
        Define en qué mes comienza el año fiscal. Afecta gráficos con fechas agrupados por año, trimestre o
        semestre, además de acumulados YTD y comparaciones acumuladas.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="dash-fiscal-start-month" className="text-[11px] text-[var(--studio-fg-muted)] shrink-0">
          Inicio del año fiscal
        </Label>
        <select
          id="dash-fiscal-start-month"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 min-w-[10rem] rounded-md border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 text-xs text-[var(--studio-fg)]"
        >
          {FISCAL_YEAR_MONTH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-[var(--studio-fg-muted)]">
          {isCalendarYear
            ? "Año calendario (enero–diciembre)"
            : `Ejercicio ${FISCAL_YEAR_MONTH_OPTIONS.find((o) => o.value === value)?.label ?? ""} – ${
                FISCAL_YEAR_MONTH_OPTIONS[(value + 10) % 12]?.label ?? ""
              }`}
        </span>
      </div>
    </div>
  );
}
