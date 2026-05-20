"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { CompareSpec, CompareTemporalMode, ComparePeriodSource } from "@/lib/dashboard/compareSpec";
import type { DateGranularity } from "@/lib/dashboard/dateFormatting";

const GRANULARITIES: DateGranularity[] = ["day", "week", "month", "quarter", "semester", "year"];

export type CompareSpecFieldsProps = {
  variant: "studio" | "etl";
  compare: CompareSpec;
  setCompare: (next: CompareSpec) => void;
  timeColumnDefault: string;
  timeColumnOptions?: string[];
  formatTimeColumnLabel?: (field: string) => string;
  granularity: DateGranularity;
  onGranularityChange?: (g: DateGranularity) => void;
  dims: string[];
  compareColumnCandidates: string[];
  fixedValue: string;
  onFixedValueChange: (value: string) => void;
  onMissingTimeColumn?: () => void;
  onMissingColumnCandidate?: () => void;
  showKpiTemporalSeriesHint?: boolean;
  /** KPI: explica que el valor grande es el total y la comparación es del último período. */
  showKpiTotalVsPeriodHint?: boolean;
};

function fieldClass(variant: "studio" | "etl"): string {
  if (variant === "etl") return "w-full h-9 rounded-lg border px-3 text-sm";
  return "mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs";
}

function labelClass(variant: "studio" | "etl"): string {
  return variant === "etl" ? "text-sm font-medium block" : "text-[11px] text-[var(--studio-fg-muted)]";
}

function etlLabelStyle(variant: "studio" | "etl"): { color: string } | undefined {
  return variant === "etl" ? { color: "var(--platform-fg-muted)" } : undefined;
}

function etlSelectStyle(variant: "studio" | "etl") {
  return variant === "etl"
    ? ({ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" } as const)
    : undefined;
}

function FieldsBlock({
  variant,
  children,
  className = "",
}: {
  variant: "studio" | "etl";
  children: ReactNode;
  className?: string;
}) {
  if (variant === "studio") return <div className={className}>{children}</div>;
  return (
    <div
      className={`rounded-lg border p-3 ${className}`.trim()}
      style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}
    >
      {children}
    </div>
  );
}

function PeriodSourceSelect({
  variant,
  value,
  onChange,
}: {
  variant: "studio" | "etl";
  value: ComparePeriodSource;
  onChange: (v: ComparePeriodSource) => void;
}) {
  return (
    <>
      <Label className={labelClass(variant)} style={etlLabelStyle(variant)}>
        Fuente del período
      </Label>
      <select
        className={fieldClass(variant)}
        style={etlSelectStyle(variant)}
        value={value}
        onChange={(e) => onChange(e.target.value as ComparePeriodSource)}
      >
        <option value="dashboard">Heredar (tablero + filtros)</option>
        <option value="widget">Priorizar rango de fechas del widget</option>
        <option value="fixed">Fijo (sin expansión automática)</option>
        <option value="data_max">Último dato disponible</option>
      </select>
    </>
  );
}

function DimCheckboxes({
  variant,
  dims,
  selected,
  onToggle,
}: {
  variant: "studio" | "etl";
  dims: string[];
  selected: string[];
  onToggle: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {dims.map((d) => {
        const on = selected.includes(d);
        if (variant === "studio") {
          return (
            <label key={d} className="flex items-center gap-1 text-[11px] text-[var(--studio-fg)]">
              <Checkbox
                checked={on}
                onCheckedChange={() => {
                  onToggle(on ? selected.filter((x) => x !== d) : [...selected, d]);
                }}
              />
              {d}
            </label>
          );
        }
        return (
          <label key={d} className="flex items-center gap-1 text-xs" style={{ color: "var(--platform-fg)" }}>
            <input
              type="checkbox"
              checked={on}
              onChange={() => onToggle(on ? selected.filter((x) => x !== d) : [...selected, d])}
              className="rounded"
            />
            {d}
          </label>
        );
      })}
    </div>
  );
}

export function CompareSpecFields({
  variant,
  compare,
  setCompare,
  timeColumnDefault,
  timeColumnOptions,
  formatTimeColumnLabel,
  granularity,
  onGranularityChange,
  dims,
  compareColumnCandidates,
  fixedValue,
  onFixedValueChange,
  onMissingTimeColumn,
  onMissingColumnCandidate,
  showKpiTemporalSeriesHint,
  showKpiTotalVsPeriodHint,
}: CompareSpecFieldsProps) {
  const timeOptions =
    timeColumnOptions && timeColumnOptions.length > 0
      ? timeColumnOptions
      : timeColumnDefault
        ? [timeColumnDefault]
        : [];

  return (
    <div className={variant === "studio" ? "space-y-4" : "space-y-4 mb-4"}>
      {showKpiTotalVsPeriodHint && variant === "studio" && (
        <p className="text-[10px] text-[var(--studio-fg-muted)] leading-snug">
          El número grande del KPI es el <strong className="font-medium text-[var(--studio-fg)]">total del rango</strong>{" "}
          (filtros actuales). La comparación debajo muestra la variación del{" "}
          <strong className="font-medium text-[var(--studio-fg)]">último período</strong> respecto al anterior.
        </p>
      )}
      {showKpiTemporalSeriesHint && variant === "studio" && (
        <p className="text-[10px] text-amber-700 dark:text-amber-500/90 leading-snug">
          Recomendado: definí la columna de fecha y granularidad (mes/día) en la métrica para alinear períodos con los
          filtros del tablero.
        </p>
      )}

      <FieldsBlock variant={variant}>
        <Label className={labelClass(variant)} style={etlLabelStyle(variant)}>
          Tipo de comparación
        </Label>
        <select
          className={fieldClass(variant)}
          style={etlSelectStyle(variant)}
          value={compare.kind}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "none") {
              setCompare({ kind: "none" });
              return;
            }
            if (v === "temporal") {
              if (!timeColumnDefault && timeOptions.length === 0) {
                onMissingTimeColumn?.();
                return;
              }
              setCompare({
                kind: "temporal",
                mode: "prev_bucket",
                timeColumn: timeColumnDefault || timeOptions[0]!,
                granularity,
                periodSource: "dashboard",
              });
              return;
            }
            if (v === "column") {
              const first = compareColumnCandidates[0] ?? "";
              if (!first) {
                onMissingColumnCandidate?.();
                return;
              }
              setCompare({ kind: "column", refColumn: first });
              return;
            }
            if (v === "fixed") {
              const n = Number.parseFloat(fixedValue);
              setCompare(Number.isFinite(n) ? { kind: "fixed", value: n } : { kind: "none" });
              return;
            }
            if (v === "average") {
              setCompare({ kind: "average", scope: "global", partitionDimensions: [] });
              return;
            }
            if (v === "total_share") {
              setCompare({ kind: "total_share", partitionDimensions: [] });
              return;
            }
            if (v === "cumulative") {
              if (!timeColumnDefault && timeOptions.length === 0) {
                onMissingTimeColumn?.();
                return;
              }
              setCompare({
                kind: "cumulative",
                mode: "month_vs_ytd",
                timeColumn: timeColumnDefault || timeOptions[0]!,
                granularity,
                periodSource: "dashboard",
              });
            }
          }}
        >
          <option value="none">Ninguna</option>
          <option value="temporal">Temporal</option>
          <option value="column">Otra columna del resultado</option>
          <option value="fixed">Valor fijo</option>
          <option value="average">Promedio</option>
          <option value="total_share">Participación sobre total</option>
          <option value="cumulative">Acumulados (YTD)</option>
        </select>
      </FieldsBlock>

      {compare.kind === "temporal" && (
        <FieldsBlock variant={variant} className="space-y-2">
          <Label className={labelClass(variant)} style={etlLabelStyle(variant)}>
            Modo temporal
          </Label>
          <select
            className={fieldClass(variant)}
            style={etlSelectStyle(variant)}
            value={compare.mode}
            onChange={(e) => {
              const mode = e.target.value as CompareTemporalMode;
              setCompare({ ...compare, mode });
            }}
          >
            <option value="prev_bucket">Período anterior en la serie</option>
            <option value="same_period_prior_year">Mismo período, año anterior</option>
            <option value="calendar_prev_day">Día calendario anterior</option>
            <option value="calendar_prev_week">Semana calendario anterior</option>
            <option value="calendar_prev_month">Mes calendario anterior</option>
            <option value="calendar_prev_year">Año calendario anterior</option>
          </select>
          {timeOptions.length > 0 && (
            <>
              <Label className={labelClass(variant)} style={etlLabelStyle(variant)}>
                Campo de fecha
              </Label>
              <select
                className={fieldClass(variant)}
                style={etlSelectStyle(variant)}
                value={compare.timeColumn}
                onChange={(e) => setCompare({ ...compare, timeColumn: e.target.value })}
              >
                {timeOptions.map((f) => (
                  <option key={f} value={f}>
                    {formatTimeColumnLabel ? formatTimeColumnLabel(f) : f}
                  </option>
                ))}
              </select>
            </>
          )}
          {onGranularityChange && (
            <>
              <Label className={labelClass(variant)} style={etlLabelStyle(variant)}>
                Granularidad
              </Label>
              <select
                className={fieldClass(variant)}
                style={etlSelectStyle(variant)}
                value={compare.granularity}
                onChange={(e) => {
                  const g = e.target.value as DateGranularity;
                  onGranularityChange(g);
                  setCompare({ ...compare, granularity: g });
                }}
              >
                {GRANULARITIES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </>
          )}
          <PeriodSourceSelect
            variant={variant}
            value={compare.periodSource ?? "dashboard"}
            onChange={(periodSource) => setCompare({ ...compare, periodSource })}
          />
        </FieldsBlock>
      )}

      {compare.kind === "column" && (
        <FieldsBlock variant={variant}>
          <Label className={labelClass(variant)} style={etlLabelStyle(variant)}>
            Columna de referencia
          </Label>
          <select
            className={fieldClass(variant)}
            style={etlSelectStyle(variant)}
            value={compare.refColumn}
            onChange={(e) => setCompare({ kind: "column", refColumn: e.target.value })}
          >
            {compareColumnCandidates.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FieldsBlock>
      )}

      {compare.kind === "fixed" && (
        <FieldsBlock variant={variant}>
          <Label className={labelClass(variant)} style={etlLabelStyle(variant)}>
            Valor fijo
          </Label>
          <Input
            type="text"
            className={
              variant === "etl"
                ? "h-9 rounded-lg text-sm max-w-[140px] !bg-[var(--platform-bg)]"
                : "mt-0.5 h-8 text-xs border-[var(--studio-border)]"
            }
            style={variant === "etl" ? { borderColor: "var(--platform-border)", color: "var(--platform-fg)" } : undefined}
            value={fixedValue}
            onChange={(e) => {
              onFixedValueChange(e.target.value);
              const n = Number.parseFloat(e.target.value);
              if (Number.isFinite(n)) setCompare({ kind: "fixed", value: n });
            }}
          />
        </FieldsBlock>
      )}

      {compare.kind === "average" && (
        <FieldsBlock variant={variant} className="space-y-2">
          <Label className={labelClass(variant)} style={etlLabelStyle(variant)}>
            Ámbito
          </Label>
          <select
            className={fieldClass(variant)}
            style={etlSelectStyle(variant)}
            value={compare.scope}
            onChange={(e) => {
              const scope = e.target.value === "partition" ? "partition" : "global";
              setCompare({
                kind: "average",
                scope,
                partitionDimensions: scope === "partition" ? dims.slice(0, 1) : [],
              });
            }}
          >
            <option value="global">Promedio general</option>
            <option value="partition">Por dimensión</option>
          </select>
          {compare.scope === "partition" && (
            <DimCheckboxes
              variant={variant}
              dims={dims}
              selected={compare.partitionDimensions}
              onToggle={(next) => setCompare({ kind: "average", scope: "partition", partitionDimensions: next })}
            />
          )}
        </FieldsBlock>
      )}

      {compare.kind === "total_share" && (
        <FieldsBlock variant={variant} className="space-y-2">
          <Label className={labelClass(variant)} style={etlLabelStyle(variant)}>
            Total por grupo (vacío = global)
          </Label>
          <DimCheckboxes
            variant={variant}
            dims={dims}
            selected={compare.partitionDimensions}
            onToggle={(next) => setCompare({ kind: "total_share", partitionDimensions: next })}
          />
        </FieldsBlock>
      )}

      {compare.kind === "cumulative" && (
        <FieldsBlock variant={variant} className="space-y-2">
          <Label className={labelClass(variant)} style={etlLabelStyle(variant)}>
            Modo acumulado
          </Label>
          <select
            className={fieldClass(variant)}
            style={etlSelectStyle(variant)}
            value={compare.mode}
            onChange={(e) => {
              const mode = e.target.value as "month_vs_ytd" | "vs_prior_year_ytd" | "ytd_running";
              setCompare({ ...compare, mode });
            }}
          >
            <option value="month_vs_ytd">Mes vs YTD</option>
            <option value="vs_prior_year_ytd">YTD vs año anterior</option>
            <option value="ytd_running">YTD acumulado</option>
          </select>
          {timeOptions.length > 0 && (
            <>
              <Label className={labelClass(variant)} style={etlLabelStyle(variant)}>
                Campo de fecha
              </Label>
              <select
                className={fieldClass(variant)}
                style={etlSelectStyle(variant)}
                value={compare.timeColumn}
                onChange={(e) => setCompare({ ...compare, timeColumn: e.target.value })}
              >
                {timeOptions.map((f) => (
                  <option key={f} value={f}>
                    {formatTimeColumnLabel ? formatTimeColumnLabel(f) : f}
                  </option>
                ))}
              </select>
            </>
          )}
          {onGranularityChange && (
            <>
              <Label className={labelClass(variant)} style={etlLabelStyle(variant)}>
                Granularidad
              </Label>
              <select
                className={fieldClass(variant)}
                style={etlSelectStyle(variant)}
                value={compare.granularity}
                onChange={(e) => {
                  const g = e.target.value as DateGranularity;
                  onGranularityChange(g);
                  setCompare({ ...compare, granularity: g });
                }}
              >
                {GRANULARITIES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </>
          )}
          <PeriodSourceSelect
            variant={variant}
            value={compare.periodSource ?? "dashboard"}
            onChange={(periodSource) => setCompare({ ...compare, periodSource })}
          />
        </FieldsBlock>
      )}
    </div>
  );
}
