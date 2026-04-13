"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ChartLabelOverridesSectionProps = {
  title: string;
  description?: string;
  entries: [string, string][];
  rawDrafts: Record<string, string>;
  onRawDraftChange: (rawKey: string, value: string) => void;
  onCommitRawDraft: (rawKey: string, display: string) => void;
  onDisplayChange: (rawKey: string, display: string) => void;
  onRemove: (rawKey: string) => void;
  onAdd: () => void;
  onFillFromPreview?: () => void;
  fillFromPreviewDisabled?: boolean;
  /** clases del contenedor exterior */
  className?: string;
  titleClassName?: string;
  useAddMetricStyles?: boolean;
};

export function ChartLabelOverridesSection({
  title,
  description,
  entries,
  rawDrafts,
  onRawDraftChange,
  onCommitRawDraft,
  onDisplayChange,
  onRemove,
  onAdd,
  onFillFromPreview,
  fillFromPreviewDisabled,
  className = "",
  titleClassName,
  useAddMetricStyles = false,
}: ChartLabelOverridesSectionProps) {
  const labelCls = titleClassName ?? (useAddMetricStyles ? "add-metric-label" : "text-xs font-medium text-[var(--studio-fg-muted)]");
  const inputCls = useAddMetricStyles ? "h-8 text-xs flex-1" : "h-8 flex-1 text-xs";

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      <Label className={labelCls}>{title}</Label>
      {description ? (
        <p
          className={
            useAddMetricStyles
              ? "text-[11px] text-[var(--studio-fg-muted)] mt-0.5 mb-2"
              : "mb-2 mt-0.5 text-[11px] text-[var(--studio-fg-muted)]"
          }
        >
          {description}
        </p>
      ) : null}
      {onFillFromPreview && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={useAddMetricStyles ? "h-8 text-xs" : "h-8 text-xs"}
          disabled={fillFromPreviewDisabled}
          onClick={onFillFromPreview}
        >
          Rellenar desde vista previa
        </Button>
      )}
      <div className="space-y-2">
        {entries.map(([raw, display], idx) => (
          <div key={`override-${idx}-${raw}`} className="flex items-center gap-2">
            <Input
              value={rawDrafts[raw] ?? raw}
              onChange={(e) => onRawDraftChange(raw, e.target.value)}
              onBlur={() => onCommitRawDraft(raw, display)}
              placeholder="Valor en datos (ej. 2025-04)"
              className={inputCls}
            />
            <span className={useAddMetricStyles ? "text-[var(--studio-fg-muted)] text-xs" : "text-xs text-[var(--studio-fg-muted)]"}>
              →
            </span>
            <Input
              value={display}
              onChange={(e) => onDisplayChange(raw, e.target.value)}
              placeholder="Texto a mostrar"
              className={inputCls}
            />
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-500" onClick={() => onRemove(raw)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className={useAddMetricStyles ? "mt-2 h-8 text-xs" : "mt-2 h-8 text-xs"} onClick={onAdd}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Añadir etiqueta
      </Button>
    </div>
  );
}

export const ANALYSIS_DATE_DISPLAY_FORMAT_OPTIONS: { value: "" | "short" | "monthYear" | "year" | "datetime"; label: string }[] = [
  { value: "", label: "Predeterminado (según granularidad)" },
  { value: "short", label: "Corta (DD/MM/YYYY)" },
  { value: "monthYear", label: "Mes y año (ej. Ene 2025)" },
  { value: "year", label: "Solo año" },
  { value: "datetime", label: "Fecha y hora" },
];
