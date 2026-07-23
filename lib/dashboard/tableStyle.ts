import type { CSSProperties } from "react";

/** Formato visual de tablas en dashboard (columnas, filas, tipografía). */
export type TableStyleConfig = {
  /** Alto de filas de datos (px). */
  rowHeight?: number;
  /** Alto del encabezado (px). */
  headerHeight?: number;
  /**
   * Tamaño de fuente base (px). Si no hay overrides por parte,
   * aplica a encabezados, celdas y título.
   */
  fontSize?: number;
  /** Tamaño de fuente de encabezados de columna (px). */
  headerFontSize?: number;
  /** Tamaño de fuente de celdas (medidas y dimensiones) (px). */
  bodyFontSize?: number;
  /** Tamaño de fuente del título de la tarjeta (px). */
  titleFontSize?: number;
  /** Padding horizontal de celdas (px). */
  cellPaddingX?: number;
  /** Padding vertical de celdas (px). */
  cellPaddingY?: number;
  /** Ancho mínimo por defecto para columnas sin override (px). */
  defaultColumnWidth?: number;
  /** Anchos explícitos por clave de columna (px). */
  columnWidths?: Record<string, number>;
  /** Alineación del texto en celdas. */
  textAlign?: "left" | "center" | "right";
  /** Filas alternadas con fondo suave. */
  zebraStripes?: boolean;
};

export const DEFAULT_TABLE_STYLE = {
  rowHeight: 32,
  headerHeight: 36,
  fontSize: 12,
  cellPaddingX: 8,
  cellPaddingY: 6,
  defaultColumnWidth: 96,
  textAlign: "left" as const,
  zebraStripes: false,
};

export type ResolvedTableStyle = {
  rowHeight: number;
  headerHeight: number;
  fontSize: number;
  headerFontSize: number;
  bodyFontSize: number;
  titleFontSize: number;
  cellPaddingX: number;
  cellPaddingY: number;
  defaultColumnWidth: number;
  columnWidths: Record<string, number>;
  textAlign: "left" | "center" | "right";
  zebraStripes: boolean;
  hasFixedColumnWidths: boolean;
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeColumnWidths(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const k = String(key ?? "").trim();
    if (!k) continue;
    const w = clampInt(val, 40, 600, 0);
    if (w > 0) out[k] = w;
  }
  return out;
}

export function normalizeTableStyleConfig(raw: unknown): TableStyleConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as TableStyleConfig;
  const columnWidths = normalizeColumnWidths(o.columnWidths);
  const next: TableStyleConfig = {
    ...(o.rowHeight != null ? { rowHeight: clampInt(o.rowHeight, 20, 120, DEFAULT_TABLE_STYLE.rowHeight) } : {}),
    ...(o.headerHeight != null
      ? { headerHeight: clampInt(o.headerHeight, 24, 120, DEFAULT_TABLE_STYLE.headerHeight) }
      : {}),
    ...(o.fontSize != null ? { fontSize: clampInt(o.fontSize, 9, 24, DEFAULT_TABLE_STYLE.fontSize) } : {}),
    ...(o.headerFontSize != null
      ? { headerFontSize: clampInt(o.headerFontSize, 9, 28, DEFAULT_TABLE_STYLE.fontSize) }
      : {}),
    ...(o.bodyFontSize != null
      ? { bodyFontSize: clampInt(o.bodyFontSize, 9, 28, DEFAULT_TABLE_STYLE.fontSize) }
      : {}),
    ...(o.titleFontSize != null
      ? { titleFontSize: clampInt(o.titleFontSize, 9, 32, DEFAULT_TABLE_STYLE.fontSize) }
      : {}),
    ...(o.cellPaddingX != null
      ? { cellPaddingX: clampInt(o.cellPaddingX, 0, 32, DEFAULT_TABLE_STYLE.cellPaddingX) }
      : {}),
    ...(o.cellPaddingY != null
      ? { cellPaddingY: clampInt(o.cellPaddingY, 0, 32, DEFAULT_TABLE_STYLE.cellPaddingY) }
      : {}),
    ...(o.defaultColumnWidth != null
      ? { defaultColumnWidth: clampInt(o.defaultColumnWidth, 48, 600, DEFAULT_TABLE_STYLE.defaultColumnWidth) }
      : {}),
    ...(Object.keys(columnWidths).length > 0 ? { columnWidths } : {}),
    ...(o.textAlign === "center" || o.textAlign === "right" || o.textAlign === "left"
      ? { textAlign: o.textAlign }
      : {}),
    ...(o.zebraStripes === true ? { zebraStripes: true } : {}),
  };
  return Object.keys(next).length > 0 ? next : undefined;
}

export function resolveTableStyle(partial?: TableStyleConfig | null): ResolvedTableStyle {
  const p = partial ?? {};
  const columnWidths = normalizeColumnWidths(p.columnWidths);
  const baseFont = clampInt(p.fontSize, 9, 24, DEFAULT_TABLE_STYLE.fontSize);
  return {
    rowHeight: clampInt(p.rowHeight, 20, 120, DEFAULT_TABLE_STYLE.rowHeight),
    headerHeight: clampInt(p.headerHeight, 24, 120, DEFAULT_TABLE_STYLE.headerHeight),
    fontSize: baseFont,
    headerFontSize: clampInt(p.headerFontSize, 9, 28, baseFont),
    bodyFontSize: clampInt(p.bodyFontSize, 9, 28, baseFont),
    titleFontSize: clampInt(p.titleFontSize, 9, 32, baseFont),
    cellPaddingX: clampInt(p.cellPaddingX, 0, 32, DEFAULT_TABLE_STYLE.cellPaddingX),
    cellPaddingY: clampInt(p.cellPaddingY, 0, 32, DEFAULT_TABLE_STYLE.cellPaddingY),
    defaultColumnWidth: clampInt(p.defaultColumnWidth, 48, 600, DEFAULT_TABLE_STYLE.defaultColumnWidth),
    columnWidths,
    textAlign: p.textAlign === "center" || p.textAlign === "right" ? p.textAlign : "left",
    zebraStripes: p.zebraStripes === true,
    hasFixedColumnWidths:
      Object.keys(columnWidths).length > 0 ||
      (p.defaultColumnWidth != null && Number.isFinite(Number(p.defaultColumnWidth))),
  };
}

export function resolveTableColumnWidth(style: ResolvedTableStyle, columnKey: string): number {
  const key = String(columnKey ?? "").trim();
  if (key && style.columnWidths[key] != null) return style.columnWidths[key]!;
  return style.defaultColumnWidth;
}

export function tableHeaderCellStyle(style: ResolvedTableStyle, columnKey: string): CSSProperties {
  const width = resolveTableColumnWidth(style, columnKey);
  return {
    minWidth: width,
    width,
    maxWidth: width,
    height: style.headerHeight,
    padding: `${style.cellPaddingY}px ${style.cellPaddingX}px`,
    textAlign: style.textAlign,
    fontSize: style.headerFontSize,
    lineHeight: 1.25,
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

export function tableBodyCellStyle(style: ResolvedTableStyle, columnKey: string): CSSProperties {
  const width = resolveTableColumnWidth(style, columnKey);
  return {
    minWidth: width,
    width,
    maxWidth: width,
    height: style.rowHeight,
    padding: `${style.cellPaddingY}px ${style.cellPaddingX}px`,
    textAlign: style.textAlign,
    fontSize: style.bodyFontSize,
    lineHeight: 1.25,
    verticalAlign: "middle",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

export function tableRowStyle(style: ResolvedTableStyle, rowIndex: number): CSSProperties | undefined {
  if (!style.zebraStripes || rowIndex % 2 === 0) return undefined;
  return { background: "rgba(128, 128, 128, 0.08)" };
}
