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

/** Convierte un placement empaquetado a `fixedGrid` (1-based). */
export function packedPlacementToFixedGrid(placement: {
  gridColumn: string;
  gridRow: string;
  span: number;
  rowSpan: number;
}): DashboardFixedGrid {
  const colMatch = placement.gridColumn.match(/^(\d+)\s*\/\s*span\s+(\d+)/);
  const rowMatch = placement.gridRow.match(/^(\d+)\s*\/\s*span\s+(\d+)/);
  return {
    col: colMatch ? Number(colMatch[1]) : 1,
    row: rowMatch ? Number(rowMatch[1]) : 1,
    colSpan: colMatch ? Number(colMatch[2]) : placement.span,
    rowSpan: rowMatch ? Number(rowMatch[2]) : placement.rowSpan,
  };
}

/** Matriz de ocupación compartida para empaquetado y búsqueda de celdas libres. */
export type GridOccupancy = {
  cols: number;
  cells: boolean[][];
  ensureRows: (minRows: number) => void;
  isFree: (startRow: number, startCol: number, span: number, rowSpan: number) => boolean;
  mark: (startRow: number, startCol: number, span: number, rowSpan: number) => void;
  unmark: (startRow: number, startCol: number, span: number, rowSpan: number) => void;
};

export function createGridOccupancy(cols: number): GridOccupancy {
  const cells: boolean[][] = [];
  const ensureRows = (minRows: number) => {
    while (cells.length < minRows) {
      cells.push(Array(cols).fill(false));
    }
  };
  const isFree = (startRow: number, startCol: number, span: number, rowSpan: number): boolean => {
    if (startCol < 0 || startCol + span > cols) return false;
    ensureRows(startRow + rowSpan);
    for (let dr = 0; dr < rowSpan; dr++) {
      for (let dc = 0; dc < span; dc++) {
        if (cells[startRow + dr]![startCol + dc]) return false;
      }
    }
    return true;
  };
  const mark = (startRow: number, startCol: number, span: number, rowSpan: number) => {
    ensureRows(startRow + rowSpan);
    for (let dr = 0; dr < rowSpan; dr++) {
      for (let dc = 0; dc < span; dc++) {
        cells[startRow + dr]![startCol + dc] = true;
      }
    }
  };
  const unmark = (startRow: number, startCol: number, span: number, rowSpan: number) => {
    ensureRows(startRow + rowSpan);
    for (let dr = 0; dr < rowSpan; dr++) {
      for (let dc = 0; dc < span; dc++) {
        cells[startRow + dr]![startCol + dc] = false;
      }
    }
  };
  return { cols, cells, ensureRows, isFree, mark, unmark };
}

/**
 * Busca la celda libre más cercana (Manhattan en grid) que acepte el span.
 * `preferCol`/`preferRow` son 1-based.
 */
export function findFreeGridCell(
  occ: GridOccupancy,
  colSpan: number,
  rowSpan: number,
  preferCol: number,
  preferRow: number,
  maxSearchRows = 80
): { col: number; row: number } | null {
  const cols = occ.cols;
  const pc = Math.max(1, Math.min(preferCol, cols - colSpan + 1));
  const pr = Math.max(1, preferRow);
  type Candidate = { col: number; row: number; dist: number };
  const candidates: Candidate[] = [];
  for (let r = 0; r < maxSearchRows; r++) {
    for (let c = 0; c <= cols - colSpan; c++) {
      if (occ.isFree(r, c, colSpan, rowSpan)) {
        const dist = Math.abs(c + 1 - pc) + Math.abs(r + 1 - pr);
        candidates.push({ col: c + 1, row: r + 1, dist });
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.dist - b.dist || a.row - b.row || a.col - b.col);
  return { col: candidates[0]!.col, row: candidates[0]!.row };
}

/** Convierte coordenadas de puntero a celda de rejilla (1-based). */
export function clientPointToGridCell(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  cols: number,
  rowUnitPx: number = DASHBOARD_GRID_ROW_UNIT_PX,
  rowGapPx: number = DASHBOARD_GRID_ROW_GAP_PX_DEFAULT
): { col: number; row: number } {
  const relX = clientX - containerRect.left;
  const relY = clientY - containerRect.top;
  const colWidth = containerRect.width / cols;
  const rowStride = rowUnitPx + rowGapPx;
  const col = Math.max(1, Math.min(cols, Math.floor(relX / colWidth) + 1));
  const row = Math.max(1, Math.floor(relY / rowStride) + 1);
  return { col, row };
}

/** Orden visual (fila, columna) → `gridOrder` para migración manual → auto. */
export function visualOrderFromFixedGrids<T extends { id: string; fixedGrid?: DashboardFixedGrid | null }>(
  widgets: T[]
): T[] {
  return [...widgets].sort((a, b) => {
    const fa = a.fixedGrid;
    const fb = b.fixedGrid;
    const ra = fa?.row ?? 9999;
    const rb = fb?.row ?? 9999;
    if (ra !== rb) return ra - rb;
    return (fa?.col ?? 9999) - (fb?.col ?? 9999);
  });
}

/** Snapshots de placements empaquetados → `fixedGrid` por widget id. */
export function placementsToFixedGridMap<T extends { id: string }>(
  placements: PackedGridPlacement<T>[]
): Map<string, DashboardFixedGrid> {
  const map = new Map<string, DashboardFixedGrid>();
  for (const p of placements) {
    map.set(p.widget.id, packedPlacementToFixedGrid(p));
  }
  return map;
}

function compactPlacementsUp(
  placements: { startRow: number; startCol: number; span: number; rowSpan: number }[],
  occ: GridOccupancy
): void {
  for (const p of placements) {
    let r = p.startRow;
    while (r > 0 && occ.isFree(r - 1, p.startCol, p.span, p.rowSpan)) {
      occ.unmark(r, p.startCol, p.span, p.rowSpan);
      r -= 1;
      occ.mark(r, p.startCol, p.span, p.rowSpan);
    }
    p.startRow = r;
  }
}

/** Skyline: coloca cada widget en la fila más alta posible (menor row de inicio). */
function placeWithSkyline<T extends PackedLayoutWidget>(
  w: T,
  cols: number,
  rowUnitPx: number,
  rowGapPx: number,
  occ: GridOccupancy,
  skyline: number[]
): { startRow: number; startCol: number; span: number; rowSpan: number } | null {
  const span = clampGridSpan(w.gridSpan, 2);
  const rowSpan = minRowSpanForMinHeight(defaultWidgetMinHeight(w), rowUnitPx, rowGapPx);
  let bestRow = Infinity;
  let bestCol = -1;
  for (let c = 0; c <= cols - span; c++) {
    let maxH = 0;
    for (let i = c; i < c + span; i++) {
      maxH = Math.max(maxH, skyline[i] ?? 0);
    }
    if (maxH < bestRow && occ.isFree(maxH, c, span, rowSpan)) {
      bestRow = maxH;
      bestCol = c;
    }
  }
  if (bestCol < 0) {
    for (let r = 0; r < 200; r++) {
      for (let c = 0; c <= cols - span; c++) {
        if (occ.isFree(r, c, span, rowSpan)) {
          bestRow = r;
          bestCol = c;
          break;
        }
      }
      if (bestCol >= 0) break;
    }
  }
  if (bestCol < 0) return null;
  occ.mark(bestRow, bestCol, span, rowSpan);
  for (let i = bestCol; i < bestCol + span; i++) {
    skyline[i] = bestRow + rowSpan;
  }
  return { startRow: bestRow, startCol: bestCol, span, rowSpan };
}

/**
 * Coloca widgets en una rejilla de `cols` columnas (skyline + compactación).
 * Si `fixedGrid` está definido, el widget usa la celda indicada (reservada antes del empaquetado).
 */
export function computeDashboardGridPlacementsPacked<T extends PackedLayoutWidget>(
  ordered: T[],
  cols: number = DASHBOARD_GRID_COLUMN_COUNT,
  rowUnitPx: number = DASHBOARD_GRID_ROW_UNIT_PX,
  rowGapPx: number = DASHBOARD_GRID_ROW_GAP_PX_DEFAULT
): PackedGridPlacement<T>[] {
  const occ = createGridOccupancy(cols);
  const skyline = Array(cols).fill(0);

  for (const w of ordered) {
    if (!w.fixedGrid || typeof w.fixedGrid !== "object") continue;
    const fg = clampDashboardFixedGrid(w.fixedGrid, cols);
    occ.mark(fg.row - 1, fg.col - 1, fg.colSpan, fg.rowSpan);
    for (let i = fg.col - 1; i < fg.col - 1 + fg.colSpan; i++) {
      skyline[i] = Math.max(skyline[i] ?? 0, fg.row - 1 + fg.rowSpan);
    }
  }

  const placementByWidget = new Map<
    T,
    { startRow: number; startCol: number; span: number; rowSpan: number; fixed?: DashboardFixedGrid }
  >();

  for (const w of ordered) {
    if (w.fixedGrid && typeof w.fixedGrid === "object") {
      const fg = clampDashboardFixedGrid(w.fixedGrid, cols);
      placementByWidget.set(w, {
        startRow: fg.row - 1,
        startCol: fg.col - 1,
        span: fg.colSpan,
        rowSpan: fg.rowSpan,
        fixed: fg,
      });
      continue;
    }

    const placed = placeWithSkyline(w, cols, rowUnitPx, rowGapPx, occ, skyline);
    if (placed) {
      placementByWidget.set(w, placed);
    }
  }

  const packablePlacements = [...placementByWidget.entries()]
    .filter(([, p]) => !p.fixed)
    .map(([, p]) => p);
  compactPlacementsUp(packablePlacements, occ);

  return ordered
    .map((w) => {
      const p = placementByWidget.get(w);
      if (!p) return null;
      const col = p.startCol + 1;
      const row = p.startRow + 1;
      return {
        widget: w,
        gridColumn: `${col} / span ${p.span}`,
        gridRow: `${row} / span ${p.rowSpan}`,
        span: p.span,
        rowSpan: p.rowSpan,
      };
    })
    .filter((x): x is PackedGridPlacement<T> => x != null);
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

/** Ocupación excluyendo un widget (para drag/resize en modo manual). */
export function buildOccupancyExcluding<T extends { id: string; fixedGrid?: DashboardFixedGrid | null }>(
  widgets: T[],
  excludeId: string,
  cols: number
): GridOccupancy {
  const occ = createGridOccupancy(cols);
  for (const w of widgets) {
    if (w.id === excludeId || !w.fixedGrid) continue;
    const fg = clampDashboardFixedGrid(w.fixedGrid, cols);
    occ.mark(fg.row - 1, fg.col - 1, fg.colSpan, fg.rowSpan);
  }
  return occ;
}
