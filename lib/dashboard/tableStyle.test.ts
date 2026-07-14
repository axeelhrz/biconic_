import { describe, expect, it } from "vitest";
import {
  resolveTableColumnWidth,
  resolveTableStyle,
  tableBodyCellStyle,
} from "@/lib/dashboard/tableStyle";

describe("resolveTableStyle", () => {
  it("usa defaults cuando no hay config", () => {
    const s = resolveTableStyle(undefined);
    expect(s.rowHeight).toBe(32);
    expect(s.fontSize).toBe(12);
  });

  it("respeta overrides parciales", () => {
    const s = resolveTableStyle({ rowHeight: 48, fontSize: 14, zebraStripes: true });
    expect(s.rowHeight).toBe(48);
    expect(s.zebraStripes).toBe(true);
  });
});

describe("resolveTableColumnWidth", () => {
  it("usa ancho por columna o default", () => {
    const s = resolveTableStyle({ defaultColumnWidth: 100, columnWidths: { ventas: 200 } });
    expect(resolveTableColumnWidth(s, "ventas")).toBe(200);
    expect(resolveTableColumnWidth(s, "otro")).toBe(100);
  });
});

describe("tableBodyCellStyle", () => {
  it("aplica alto de fila", () => {
    const s = resolveTableStyle({ rowHeight: 40 });
    expect(tableBodyCellStyle(s, "x").height).toBe(40);
  });
});
