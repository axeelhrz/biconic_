import { describe, expect, it } from "vitest";
import {
  resolveTableColumnWidth,
  resolveTableStyle,
  tableBodyCellStyle,
  tableHeaderCellStyle,
} from "@/lib/dashboard/tableStyle";

describe("resolveTableStyle", () => {
  it("usa defaults cuando no hay config", () => {
    const s = resolveTableStyle(undefined);
    expect(s.rowHeight).toBe(32);
    expect(s.fontSize).toBe(12);
    expect(s.headerFontSize).toBe(12);
    expect(s.bodyFontSize).toBe(12);
    expect(s.titleFontSize).toBe(12);
  });

  it("respeta overrides parciales", () => {
    const s = resolveTableStyle({ rowHeight: 48, fontSize: 14, zebraStripes: true });
    expect(s.rowHeight).toBe(48);
    expect(s.zebraStripes).toBe(true);
    expect(s.headerFontSize).toBe(14);
    expect(s.bodyFontSize).toBe(14);
  });

  it("permite tipografía por parte", () => {
    const s = resolveTableStyle({
      fontSize: 12,
      headerFontSize: 11,
      bodyFontSize: 13,
      titleFontSize: 16,
    });
    expect(s.headerFontSize).toBe(11);
    expect(s.bodyFontSize).toBe(13);
    expect(s.titleFontSize).toBe(16);
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
  it("aplica alto de fila y bodyFontSize", () => {
    const s = resolveTableStyle({ rowHeight: 40, bodyFontSize: 15 });
    expect(tableBodyCellStyle(s, "x").height).toBe(40);
    expect(tableBodyCellStyle(s, "x").fontSize).toBe(15);
  });
});

describe("tableHeaderCellStyle", () => {
  it("usa headerFontSize", () => {
    const s = resolveTableStyle({ headerFontSize: 10, fontSize: 14 });
    expect(tableHeaderCellStyle(s, "x").fontSize).toBe(10);
  });
});
