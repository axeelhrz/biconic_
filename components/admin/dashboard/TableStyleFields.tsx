"use client";

import type { TableStyleConfig } from "@/lib/dashboard/tableStyle";
import { DEFAULT_TABLE_STYLE } from "@/lib/dashboard/tableStyle";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export type TableStyleFieldsProps = {
  value: TableStyleConfig | undefined;
  columnKeys: string[];
  onChange: (next: TableStyleConfig | undefined) => void;
  variant?: "studio" | "wizard";
};

function numOrUndef(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function TableStyleFields({ value, columnKeys, onChange, variant = "studio" }: TableStyleFieldsProps) {
  const v = value ?? {};
  const labelClass =
    variant === "studio"
      ? "text-xs font-medium text-[var(--studio-fg-muted)]"
      : "text-xs font-medium text-[var(--platform-fg-muted)]";

  const patch = (p: Partial<TableStyleConfig>) => {
    const merged = { ...v, ...p };
    const hasAny =
      merged.rowHeight != null ||
      merged.headerHeight != null ||
      merged.fontSize != null ||
      merged.cellPaddingX != null ||
      merged.cellPaddingY != null ||
      merged.defaultColumnWidth != null ||
      (merged.columnWidths && Object.keys(merged.columnWidths).length > 0) ||
      merged.textAlign != null ||
      merged.zebraStripes === true;
    onChange(hasAny ? merged : undefined);
  };

  const setColumnWidth = (col: string, width: number | undefined) => {
    const widths = { ...(v.columnWidths ?? {}) };
    if (width == null || width <= 0) delete widths[col];
    else widths[col] = width;
    patch({ columnWidths: Object.keys(widths).length ? widths : undefined });
  };

  const inputClass =
    variant === "studio"
      ? "h-8 text-xs border-[var(--studio-border)] bg-[var(--studio-surface)]"
      : "h-8 text-xs";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className={labelClass}>Alto de filas (px)</Label>
          <Input
            type="number"
            min={20}
            max={120}
            className={`mt-1 ${inputClass}`}
            value={v.rowHeight ?? ""}
            placeholder={String(DEFAULT_TABLE_STYLE.rowHeight)}
            onChange={(e) => patch({ rowHeight: numOrUndef(e.target.value) })}
          />
        </div>
        <div>
          <Label className={labelClass}>Alto de encabezado (px)</Label>
          <Input
            type="number"
            min={24}
            max={120}
            className={`mt-1 ${inputClass}`}
            value={v.headerHeight ?? ""}
            placeholder={String(DEFAULT_TABLE_STYLE.headerHeight)}
            onChange={(e) => patch({ headerHeight: numOrUndef(e.target.value) })}
          />
        </div>
        <div>
          <Label className={labelClass}>Tamaño de fuente (px)</Label>
          <Input
            type="number"
            min={9}
            max={24}
            className={`mt-1 ${inputClass}`}
            value={v.fontSize ?? ""}
            placeholder={String(DEFAULT_TABLE_STYLE.fontSize)}
            onChange={(e) => patch({ fontSize: numOrUndef(e.target.value) })}
          />
        </div>
        <div>
          <Label className={labelClass}>Ancho default de columnas (px)</Label>
          <Input
            type="number"
            min={48}
            max={600}
            className={`mt-1 ${inputClass}`}
            value={v.defaultColumnWidth ?? ""}
            placeholder={String(DEFAULT_TABLE_STYLE.defaultColumnWidth)}
            onChange={(e) => patch({ defaultColumnWidth: numOrUndef(e.target.value) })}
          />
        </div>
        <div>
          <Label className={labelClass}>Padding horizontal (px)</Label>
          <Input
            type="number"
            min={0}
            max={32}
            className={`mt-1 ${inputClass}`}
            value={v.cellPaddingX ?? ""}
            placeholder={String(DEFAULT_TABLE_STYLE.cellPaddingX)}
            onChange={(e) => patch({ cellPaddingX: numOrUndef(e.target.value) })}
          />
        </div>
        <div>
          <Label className={labelClass}>Padding vertical (px)</Label>
          <Input
            type="number"
            min={0}
            max={32}
            className={`mt-1 ${inputClass}`}
            value={v.cellPaddingY ?? ""}
            placeholder={String(DEFAULT_TABLE_STYLE.cellPaddingY)}
            onChange={(e) => patch({ cellPaddingY: numOrUndef(e.target.value) })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[10rem]">
          <Label className={labelClass}>Alineación</Label>
          <select
            className={`mt-1 w-full rounded-md border px-2 ${inputClass}`}
            value={v.textAlign ?? "left"}
            onChange={(e) => patch({ textAlign: e.target.value as TableStyleConfig["textAlign"] })}
          >
            <option value="left">Izquierda</option>
            <option value="center">Centro</option>
            <option value="right">Derecha</option>
          </select>
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Checkbox
            id="table-zebra"
            checked={v.zebraStripes === true}
            onCheckedChange={(c) => patch({ zebraStripes: c === true ? true : undefined })}
          />
          <Label htmlFor="table-zebra" className={`${labelClass} cursor-pointer`}>
            Filas alternadas
          </Label>
        </div>
      </div>

      {columnKeys.length > 0 ? (
        <div className="space-y-2">
          <Label className={labelClass}>Ancho por columna (px)</Label>
          <p className="text-[11px] text-[var(--studio-fg-muted)]">
            Dejá vacío para usar el ancho por defecto. Ajustá cada columna para agrandar o achicar.
          </p>
          <div className="max-h-[200px] space-y-1.5 overflow-y-auto rounded border border-[var(--studio-border)] p-2">
            {columnKeys.map((col) => (
              <div key={col} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--studio-fg)]" title={col}>
                  {col}
                </span>
                <Input
                  type="number"
                  min={40}
                  max={600}
                  className={`h-7 w-24 shrink-0 text-xs ${inputClass}`}
                  value={v.columnWidths?.[col] ?? ""}
                  placeholder="auto"
                  onChange={(e) => setColumnWidth(col, numOrUndef(e.target.value))}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
