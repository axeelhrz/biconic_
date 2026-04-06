/** Columnas del lienzo en escritorio (editor + vista previa + viewer). */
export const DASHBOARD_GRID_COLUMN_COUNT = 6;

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
