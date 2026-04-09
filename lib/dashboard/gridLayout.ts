/** Columnas del lienzo en escritorio (editor + vista previa + viewer). */
export const DASHBOARD_GRID_COLUMN_COUNT = 6;

/**
 * Celda explícita en la rejilla CSS (1-based col/row, como en `grid-column` / `grid-row`).
 * Varios widgets pueden compartir la misma región (solapamiento); el orden visual usa `zIndex` en el contenedor.
 */
export type DashboardFixedGrid = {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
};

/**
 * Altura nominal por pista de fila implícita del grid (empaquetado 2D).
 * Debe coincidir con `grid-auto-rows` en CSS del studio y de la vista cliente.
 */
export const DASHBOARD_GRID_ROW_UNIT_PX = 56;

/** Alineado con `row-gap` de `.studio-blocks` en studio.css (0.5rem / 0.75rem @ 16px). */
export const DASHBOARD_GRID_ROW_GAP_PX_STUDIO_NARROW = 8;
export const DASHBOARD_GRID_ROW_GAP_PX_STUDIO_WIDE = 12;

/** Alineado con `.client-view-grid` row-gap 0.5rem @ 16px. */
export const DASHBOARD_GRID_ROW_GAP_PX_CLIENT = 8;

/** Default conservador si no se pasa gap (escritorio studio). */
export const DASHBOARD_GRID_ROW_GAP_PX_DEFAULT = DASHBOARD_GRID_ROW_GAP_PX_STUDIO_WIDE;

export function packRowGapPxStudio(innerWidth: number): number {
  return innerWidth >= 768 ? DASHBOARD_GRID_ROW_GAP_PX_STUDIO_WIDE : DASHBOARD_GRID_ROW_GAP_PX_STUDIO_NARROW;
}

export function packRowGapPxClient(_innerWidth: number): number {
  return DASHBOARD_GRID_ROW_GAP_PX_CLIENT;
}

/**
 * Mínimo N tal que N·rowUnit + (N−1)·rowGap ≥ minHeightPx (altura mínima del área en CSS Grid).
 */
export function minRowSpanForMinHeight(
  minHeightPx: number,
  rowUnitPx: number = DASHBOARD_GRID_ROW_UNIT_PX,
  rowGapPx: number = DASHBOARD_GRID_ROW_GAP_PX_DEFAULT
): number {
  const mh = Math.max(1, minHeightPx);
  const ru = Math.max(1, rowUnitPx);
  const g = Math.max(0, rowGapPx);
  return Math.max(1, Math.ceil((mh + g) / (ru + g)));
}

export function clampGridSpan(raw: number | undefined | null, defaultSpan = 2): number {
  const n = Number(raw);
  const base = Number.isFinite(n) ? n : defaultSpan;
  return Math.min(DASHBOARD_GRID_COLUMN_COUNT, Math.max(1, Math.round(base)));
}

/** Normaliza `fixedGrid` al rango válido de columnas y spans mínimos. */
export function clampDashboardFixedGrid(fg: DashboardFixedGrid, cols: number): DashboardFixedGrid {
  const colSpan = Math.min(cols, Math.max(1, Math.round(Number(fg.colSpan) || 1)));
  const rowSpan = Math.max(1, Math.round(Number(fg.rowSpan) || 1));
  let col = Math.max(1, Math.round(Number(fg.col) || 1));
  let row = Math.max(1, Math.round(Number(fg.row) || 1));
  if (col + colSpan - 1 > cols) {
    col = Math.max(1, cols - colSpan + 1);
  }
  return { col, row, colSpan, rowSpan };
}

export function computeDashboardGridPlacements<T extends { gridSpan?: number }>(
  ordered: T[]
): { widget: T; row: number; col: number; span: number }[] {
  const cols = DASHBOARD_GRID_COLUMN_COUNT;
  const placements: { widget: T; row: number; col: number; span: number }[] = [];
  let row = 0;
  let col = 0;
  for (const w of ordered) {
    const span = clampGridSpan(w.gridSpan, 2);
    placements.push({ widget: w, row, col, span });
    col += span;
    if (col >= cols) {
      col = 0;
      row += 1;
    }
  }
  return placements;
}

export type PackedGridPlacement<T> = {
  widget: T;
  /** p. ej. "1 / span 2" (1-based, línea CSS Grid) */
  gridColumn: string;
  gridRow: string;
  span: number;
  rowSpan: number;
};

function defaultWidgetMinHeight(w: { minHeight?: number }): number {
  const n = Number(w.minHeight);
  return Number.isFinite(n) && n > 0 ? n : 280;
}

type PackedLayoutWidget = {
  gridSpan?: number;
  minHeight?: number;
  fixedGrid?: DashboardFixedGrid | null;
};

/**
 * Coloca widgets en una rejilla de `cols` columnas rellenando huecos:
 * cada ítem ocupa `span` columnas y `rowSpan` filas según `minHeight`.
 * Si `fixedGrid` está definido, el widget no se empaqueta: usa la celda indicada (puede solaparse con otros fijos).
 * Las celdas ocupadas por `fixedGrid` se reservan antes del empaquetado del resto.
 */
export function computeDashboardGridPlacementsPacked<T extends PackedLayoutWidget>(
  ordered: T[],
  cols: number = DASHBOARD_GRID_COLUMN_COUNT,
  rowUnitPx: number = DASHBOARD_GRID_ROW_UNIT_PX,
  rowGapPx: number = DASHBOARD_GRID_ROW_GAP_PX_DEFAULT
): PackedGridPlacement<T>[] {
  const occupied: boolean[][] = [];
  const ensureRows = (minRows: number) => {
    while (occupied.length < minRows) {
      occupied.push(Array(cols).fill(false));
    }
  };
  const isFree = (startRow: number, startCol: number, span: number, rowSpan: number): boolean => {
    if (startCol + span > cols) return false;
    ensureRows(startRow + rowSpan);
    for (let dr = 0; dr < rowSpan; dr++) {
      for (let dc = 0; dc < span; dc++) {
        if (occupied[startRow + dr]![startCol + dc]) return false;
      }
    }
    return true;
  };
  const mark = (startRow: number, startCol: number, span: number, rowSpan: number) => {
    ensureRows(startRow + rowSpan);
    for (let dr = 0; dr < rowSpan; dr++) {
      for (let dc = 0; dc < span; dc++) {
        occupied[startRow + dr]![startCol + dc] = true;
      }
    }
  };

  for (const w of ordered) {
    if (!w.fixedGrid || typeof w.fixedGrid !== "object") continue;
    const fg = clampDashboardFixedGrid(w.fixedGrid, cols);
    mark(fg.row - 1, fg.col - 1, fg.colSpan, fg.rowSpan);
  }

  const out: PackedGridPlacement<T>[] = [];
  for (const w of ordered) {
    if (w.fixedGrid && typeof w.fixedGrid === "object") {
      const fg = clampDashboardFixedGrid(w.fixedGrid, cols);
      out.push({
        widget: w,
        gridColumn: `${fg.col} / span ${fg.colSpan}`,
        gridRow: `${fg.row} / span ${fg.rowSpan}`,
        span: fg.colSpan,
        rowSpan: fg.rowSpan,
      });
      continue;
    }

    const span = clampGridSpan(w.gridSpan, 2);
    const mh = defaultWidgetMinHeight(w);
    const rowSpan = minRowSpanForMinHeight(mh, rowUnitPx, rowGapPx);
    let placed = false;
    for (let r = 0; !placed; r++) {
      for (let c = 0; c <= cols - span; c++) {
        if (isFree(r, c, span, rowSpan)) {
          mark(r, c, span, rowSpan);
          out.push({
            widget: w,
            gridColumn: `${c + 1} / span ${span}`,
            gridRow: `${r + 1} / span ${rowSpan}`,
            span,
            rowSpan,
          });
          placed = true;
          break;
        }
      }
    }
  }
  return out;
}

/** Ubicación empaquetada para la celda «Añadir métrica» (después de los widgets reales). */
export function computeAddMetricPackedPlacement(
  orderedWidgets: PackedLayoutWidget[],
  cols: number = DASHBOARD_GRID_COLUMN_COUNT,
  rowUnitPx: number = DASHBOARD_GRID_ROW_UNIT_PX,
  rowGapPx: number = DASHBOARD_GRID_ROW_GAP_PX_DEFAULT,
  addMinHeight: number = 200
): { gridColumn: string; gridRow: string; rowSpan: number } {
  const phantom = { gridSpan: 1, minHeight: addMinHeight };
  const all = computeDashboardGridPlacementsPacked([...orderedWidgets, phantom], cols, rowUnitPx, rowGapPx);
  const last = all[all.length - 1];
  return {
    gridColumn: last.gridColumn,
    gridRow: last.gridRow,
    rowSpan: last.rowSpan,
  };
}
