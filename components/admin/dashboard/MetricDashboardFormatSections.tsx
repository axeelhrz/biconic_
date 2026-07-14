"use client";

import { Plus, Trash2 } from "lucide-react";
import type { DashboardTheme } from "@/types/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ChartLabelDisplayMode, ChartPercentBasis } from "@/lib/dashboard/chartOptions";
import ChartQuickCalcFields from "@/components/dashboard/ChartQuickCalcFields";
import type { ChartQuickCalc } from "@/lib/dashboard/chartQuickCalcTypes";
import { DashboardThemeFormSections, mergeCardThemePatch } from "./DashboardThemeFormSections";
import { TableStyleFields } from "./TableStyleFields";
import { HEADER_PRESET_ICONS } from "@/lib/dashboard/headerPresetIcons";
import type { ContentIconPosition } from "@/components/dashboard/DashboardWidgetRenderer";
import { CONTENT_ICON_SIZE_OPTIONS, type ContentIconSize } from "@/lib/dashboard/imageLayout";
import { CONTENT_ICON_POSITION_OPTIONS } from "@/components/dashboard/DashboardWidgetRenderer";
import {
  ANALYSIS_DATE_DISPLAY_FORMAT_OPTIONS,
} from "@/components/admin/dashboard/ChartLabelOverridesSection";
import type { AggregationConfigEdit, MetricConfigWidget, MetricConfigWidgetUpdateFn } from "./MetricConfigPanel";

type WidgetFormatSlice = Pick<
  MetricConfigWidget,
  | "title"
  | "headerIconKey"
  | "headerIconUrl"
  | "contentIconSize"
  | "contentIconPosition"
  | "cardTheme"
  | "labelDisplayMode"
  | "chartPercentGroupField"
>;

export function MetricFormatCardAndIconSection({
  widget,
  cardAppearancePreview,
  onUpdate,
}: {
  widget: WidgetFormatSlice;
  cardAppearancePreview: DashboardTheme;
  onUpdate: MetricConfigWidgetUpdateFn;
}) {
  return (
    <>
      <div className="space-y-3 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)]/40 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-[var(--studio-fg)]">Apariencia de la tarjeta</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={() => onUpdate({ cardTheme: undefined })}
          >
            Usar solo tema del dashboard
          </Button>
        </div>
        <p className="text-[11px] leading-snug text-[var(--studio-fg-muted)]">
          Fondo, bordes, tipografía y logo de esta tarjeta. Campos vacíos heredan el tema global del dashboard.
        </p>
        <DashboardThemeFormSections
          scope="card"
          value={cardAppearancePreview}
          onPatch={(patch) => onUpdate({ cardTheme: mergeCardThemePatch(widget.cardTheme, patch) })}
          labelClassName="text-xs font-medium text-[var(--studio-fg-muted)]"
          inputClassName="h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm text-[var(--studio-fg)]"
        />
      </div>

      <div className="space-y-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)]/40 p-3">
        <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Icono sobre el gráfico / KPI</Label>
        <p className="text-[11px] text-[var(--studio-fg-muted)]">
          Se muestra encima del área de datos (no en el título del widget).
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            title="Sin icono predefinido"
            onClick={() => onUpdate({ headerIconKey: undefined })}
            className={`flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg border px-2 text-[11px] font-medium transition-colors ${
              !widget.headerIconKey
                ? "border-[var(--studio-accent)] bg-[var(--studio-accent-dim)] text-[var(--studio-accent)]"
                : "border-[var(--studio-border)] text-[var(--studio-fg-muted)] hover:bg-[var(--studio-surface-hover)]"
            }`}
          >
            —
          </button>
          {HEADER_PRESET_ICONS.map(({ key, label, Icon }) => {
            const active = widget.headerIconKey === key;
            return (
              <button
                key={key}
                type="button"
                title={label}
                onClick={() => onUpdate({ headerIconKey: key, headerIconUrl: undefined })}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                  active
                    ? "border-[var(--studio-accent)] bg-[var(--studio-accent-dim)] text-[var(--studio-accent)]"
                    : "border-[var(--studio-border)] text-[var(--studio-fg-muted)] hover:bg-[var(--studio-surface-hover)] hover:text-[var(--studio-fg)]"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            );
          })}
        </div>
        <Input
          value={widget.headerIconUrl ?? ""}
          onChange={(e) =>
            onUpdate({
              headerIconUrl: e.target.value || undefined,
              ...(e.target.value.trim() ? { headerIconKey: undefined } : {}),
            })
          }
          placeholder="O pegá URL de imagen (https://…)"
          className="h-9 rounded-lg border-[var(--studio-border)] text-sm"
        />
        {(widget.headerIconKey || (widget.headerIconUrl ?? "").trim()) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Tamaño del icono</Label>
              <select
                className="mt-1.5 h-9 w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm text-[var(--studio-fg)]"
                value={widget.contentIconSize ?? "md"}
                onChange={(e) => onUpdate({ contentIconSize: e.target.value as ContentIconSize })}
              >
                {CONTENT_ICON_SIZE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Posición</Label>
              <select
                className="mt-1.5 h-9 w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm text-[var(--studio-fg)]"
                value={widget.contentIconPosition ?? "topLeft"}
                onChange={(e) => onUpdate({ contentIconPosition: e.target.value as ContentIconPosition })}
              >
                {CONTENT_ICON_POSITION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function MetricFormatQuickCalcSection({
  agg,
  updateAgg,
  widget,
  onUpdate,
  columnOptions,
}: {
  agg: AggregationConfigEdit;
  updateAgg: (patch: Partial<AggregationConfigEdit>) => void;
  widget: { chartPercentGroupField?: string };
  onUpdate: MetricConfigWidgetUpdateFn;
  columnOptions: string[];
}) {
  return (
    <div className="space-y-3 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)]/40 p-3">
      <ChartQuickCalcFields
        value={agg.chartQuickCalc}
        onChange={(v) => updateAgg({ chartQuickCalc: v === "none" ? undefined : v })}
        groupField={widget.chartPercentGroupField}
        onGroupFieldChange={(field) => onUpdate({ chartPercentGroupField: field })}
        columnOptions={columnOptions}
        labelClassName="text-xs font-medium text-[var(--studio-fg-muted)]"
        selectClassName="mt-1.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm"
        hintClassName="text-[11px] mt-1 text-[var(--studio-fg-muted)]"
      />
    </div>
  );
}

export function MetricFormatTableSection({
  agg,
  updateAgg,
  previewRows,
  tableColEntries,
  tableColKeyDrafts,
  setTableColKeyDrafts,
  commitTableColKeyDraft,
  setTableColHeader,
  removeTableColOverride,
  addTableColOverride,
  fillTableColumnLabelOverridesFromPreview,
  tableStyleColumnKeys,
  percentFieldColumnOptionsLength,
}: {
  agg: AggregationConfigEdit;
  updateAgg: (patch: Partial<AggregationConfigEdit>) => void;
  previewRows: Record<string, unknown>[];
  tableColEntries: [string, string][];
  tableColKeyDrafts: Record<string, string>;
  setTableColKeyDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  commitTableColKeyDraft: (oldKey: string, headerText: string) => void;
  setTableColHeader: (dataKey: string, header: string) => void;
  removeTableColOverride: (dataKey: string) => void;
  addTableColOverride: () => void;
  fillTableColumnLabelOverridesFromPreview: () => void;
  tableStyleColumnKeys: string[];
  percentFieldColumnOptionsLength: number;
}) {
  return (
    <>
      <div className="space-y-3 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)]/40 p-3">
        <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Encabezados de tabla</Label>
        <p className="text-[11px] text-[var(--studio-fg-muted)]">
          Mapeá el nombre de columna en los datos al texto del encabezado visible.
        </p>
        {previewRows.length > 0 && tableColEntries.length === 0 ? (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Cargá datos con «Actualizar» y usá «Rellenar desde vista previa».
          </p>
        ) : null}
        {previewRows.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={percentFieldColumnOptionsLength === 0}
            onClick={fillTableColumnLabelOverridesFromPreview}
          >
            Rellenar desde vista previa
          </Button>
        ) : null}
        <div className="space-y-2">
          {tableColEntries.map(([dataKey, headerText], idx) => (
            <div key={`tcol-${idx}-${dataKey}`} className="flex items-center gap-2">
              <Input
                value={tableColKeyDrafts[dataKey] ?? dataKey}
                onChange={(e) => setTableColKeyDrafts((prev) => ({ ...prev, [dataKey]: e.target.value }))}
                onBlur={() => commitTableColKeyDraft(dataKey, headerText)}
                placeholder="Columna en datos"
                className="h-8 flex-1 text-xs font-mono"
              />
              <span className="text-xs text-[var(--studio-fg-muted)]">→</span>
              <Input
                value={headerText}
                onChange={(e) => setTableColHeader(dataKey, e.target.value)}
                placeholder="Encabezado visible"
                className="h-8 flex-1 text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-red-500"
                onClick={() => removeTableColOverride(dataKey)}
                aria-label="Quitar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addTableColOverride}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Añadir columna
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)]/40 p-3">
        <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Formato de tabla</Label>
        <p className="text-[11px] text-[var(--studio-fg-muted)]">
          Alto de filas y encabezado, fuente, padding y ancho de cada columna.
        </p>
        <TableStyleFields
          value={agg.tableStyle}
          columnKeys={tableStyleColumnKeys}
          onChange={(next) => updateAgg({ tableStyle: next })}
          variant="studio"
        />
      </div>
    </>
  );
}

export function MetricFormatDateLabelsSection({
  agg,
  updateAgg,
}: {
  agg: AggregationConfigEdit;
  updateAgg: (patch: Partial<AggregationConfigEdit>) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)]/40 p-3">
      <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Formato de fechas en etiquetas</Label>
      <p className="text-[11px] text-[var(--studio-fg-muted)]">
        Cómo se muestran las fechas en ejes y etiquetas del gráfico.
      </p>
      <div>
        <Label className="text-[11px] text-[var(--studio-fg-muted)]">Formato de etiquetas</Label>
        <select
          value={agg.analysisDateDisplayFormat ?? ""}
          onChange={(e) =>
            updateAgg({
              analysisDateDisplayFormat: (e.target.value || undefined) as AggregationConfigEdit["analysisDateDisplayFormat"],
            })
          }
          className="mt-0.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm"
        >
          {ANALYSIS_DATE_DISPLAY_FORMAT_OPTIONS.map((o) => (
            <option key={o.value || "default"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-[11px] text-[var(--studio-fg-muted)]">Fechas texto con / (import ambiguo)</Label>
        <select
          value={agg.dateSlashOrder ?? "DMY"}
          onChange={(e) => updateAgg({ dateSlashOrder: e.target.value as "DMY" | "MDY" })}
          className="mt-0.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm"
        >
          <option value="DMY">DD/MM/YYYY (día primero)</option>
          <option value="MDY">MM/DD/YYYY (mes primero, US)</option>
        </select>
      </div>
    </div>
  );
}
