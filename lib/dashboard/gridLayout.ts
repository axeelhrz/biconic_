/** Columnas del lienzo en escritorio (editor + vista previa + viewer). */
export const DASHBOARD_GRID_COLUMN_COUNT = 6;

/**
 * Altura nominal por pista de fila implícita del grid (empaquetado 2D).
 * Debe coincidir con `grid-auto-rows` en CSS del studio y de la vista cliente.
 */
export const DASHBOARD_GRID_ROW_UNIT_PX = 56;

export function clampGridSpan(raw: number | undefined | null, defaultSpan = 2): number {
  const n = Number(raw);
  const base = Number.isFinite(n) ? n : defaultSpan;
  return Math.min(DASHBOARD_GRID_COLUMN_COUNT, Math.max(1, Math.round(base)));
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

/**
 * Coloca widgets en una rejilla de `cols` columnas rellenando huecos:
 * cada ítem ocupa `span` columnas y `rowSpan` filas según `minHeight`.
 */
export function computeDashboardGridPlacementsPacked<T extends { gridSpan?: number; minHeight?: number }>(
  ordered: T[],
  cols: number = DASHBOARD_GRID_COLUMN_COUNT,
  rowUnitPx: number = DASHBOARD_GRID_ROW_UNIT_PX
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

  const out: PackedGridPlacement<T>[] = [];
  for (const w of ordered) {
    const span = clampGridSpan(w.gridSpan, 2);
    const mh = defaultWidgetMinHeight(w);
    const rowSpan = Math.max(1, Math.ceil(mh / rowUnitPx));
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
  orderedWidgets: { gridSpan?: number; minHeight?: number }[],
  cols: number = DASHBOARD_GRID_COLUMN_COUNT,
  rowUnitPx: number = DASHBOARD_GRID_ROW_UNIT_PX,
  addMinHeight: number = 200
): { gridColumn: string; gridRow: string; rowSpan: number } {
  const phantom = { gridSpan: 1, minHeight: addMinHeight };
  const all = computeDashboardGridPlacementsPacked([...orderedWidgets, phantom], cols, rowUnitPx);
  const last = all[all.length - 1];
  return {
    gridColumn: last.gridColumn,
    gridRow: last.gridRow,
    rowSpan: last.rowSpan,
  };
}
