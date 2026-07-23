import { describe, expect, it } from "vitest";
import {
  clientPointToGridCell,
  DASHBOARD_GRID_COL_GAP_PX_DEFAULT,
  DASHBOARD_GRID_ROW_GAP_PX_DEFAULT,
  DASHBOARD_GRID_ROW_UNIT_PX,
  resolveManualDragDrop,
  type DashboardFixedGrid,
} from "./gridLayout";

function rect(width: number, height = 800): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("clientPointToGridCell", () => {
  it("accounts for column-gap when mapping X to columns", () => {
    const cols = 6;
    const gap = DASHBOARD_GRID_COL_GAP_PX_DEFAULT;
    const width = 600 + gap * (cols - 1);
    const r = rect(width);
    // Midpoint of column 3 (1-based): after 2 full strides.
    const colWidth = 600 / cols;
    const stride = colWidth + gap;
    const x = stride * 2 + colWidth / 2;
    const cell = clientPointToGridCell(x, 10, r, cols, DASHBOARD_GRID_ROW_UNIT_PX, DASHBOARD_GRID_ROW_GAP_PX_DEFAULT, gap);
    expect(cell.col).toBe(3);
  });

  it("maps Y with row gap stride", () => {
    const r = rect(600);
    const rowStride = DASHBOARD_GRID_ROW_UNIT_PX + DASHBOARD_GRID_ROW_GAP_PX_DEFAULT;
    const cell = clientPointToGridCell(10, rowStride * 2 + 1, r, 6);
    expect(cell.row).toBe(3);
  });
});

describe("resolveManualDragDrop", () => {
  const a: DashboardFixedGrid = { col: 1, row: 1, colSpan: 2, rowSpan: 4 };
  const b: DashboardFixedGrid = { col: 3, row: 1, colSpan: 2, rowSpan: 4 };

  it("moves into a free cell", () => {
    const widgets = [
      { id: "a", fixedGrid: a },
      { id: "b", fixedGrid: b },
    ];
    const updates = resolveManualDragDrop(widgets, "a", 5, 1, 6, a);
    expect(updates).toEqual([{ id: "a", fixedGrid: { ...a, col: 5, row: 1 } }]);
  });

  it("swaps when dropping onto a single overlapping card", () => {
    const widgets = [
      { id: "a", fixedGrid: a },
      { id: "b", fixedGrid: b },
    ];
    const updates = resolveManualDragDrop(widgets, "a", 3, 1, 6, a);
    const byId = Object.fromEntries(updates.map((u) => [u.id, u.fixedGrid]));
    expect(byId.a?.col).toBe(3);
    expect(byId.b?.col).toBe(1);
    expect(byId.b?.row).toBe(1);
  });

  it("falls back to nearest free cell when multiple overlaps", () => {
    const c: DashboardFixedGrid = { col: 5, row: 1, colSpan: 2, rowSpan: 4 };
    const wide: DashboardFixedGrid = { col: 1, row: 1, colSpan: 4, rowSpan: 4 };
    const widgets = [
      { id: "a", fixedGrid: wide },
      { id: "b", fixedGrid: b },
      { id: "c", fixedGrid: c },
    ];
    // Drop a (span 4) at col 3 → overlaps b and possibly c.
    const updates = resolveManualDragDrop(widgets, "a", 3, 1, 6, wide);
    expect(updates.length).toBeGreaterThanOrEqual(1);
    expect(updates.find((u) => u.id === "a")?.fixedGrid).toBeTruthy();
  });
});
