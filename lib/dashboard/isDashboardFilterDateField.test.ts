import { describe, expect, it } from "vitest";
import {
  isDashboardDateFilterOperator,
  isDashboardFilterDateField,
  looksLikeDateFieldName,
  resolveDashboardFilterOperator,
} from "@/lib/dashboard/isDashboardFilterDateField";

describe("looksLikeDateFieldName", () => {
  it("matches join date columns", () => {
    expect(looksLikeDateFieldName("join_0_fechacomprobante")).toBe(true);
    expect(looksLikeDateFieldName("fecha_venta")).toBe(true);
    expect(looksLikeDateFieldName("DATE")).toBe(true);
  });

  it("rejects non-date names", () => {
    expect(looksLikeDateFieldName("cliente")).toBe(false);
    expect(looksLikeDateFieldName("importe_total")).toBe(false);
    expect(looksLikeDateFieldName("")).toBe(false);
  });
});

describe("isDashboardFilterDateField", () => {
  it("matches metadata lists case-insensitively", () => {
    expect(
      isDashboardFilterDateField("FechaComp", {
        etlDateFields: ["fechacomp"],
      })
    ).toBe(true);
    expect(
      isDashboardFilterDateField("x", {
        dataSourceDateFields: [["a"], ["X"]],
      })
    ).toBe(true);
  });

  it("uses name heuristic when not in metadata", () => {
    expect(
      isDashboardFilterDateField("join_0_fechacomprobante", {
        etlDateFields: [],
        dataSourceDateFields: [[]],
      })
    ).toBe(true);
  });

  it("treats inputType date as temporal mode", () => {
    expect(
      isDashboardFilterDateField("cliente", {
        etlDateFields: [],
        inputType: "date",
      })
    ).toBe(true);
  });

  it("returns false for plain text fields", () => {
    expect(
      isDashboardFilterDateField("vendedor", {
        etlDateFields: ["fecha"],
        dataSourceDateFields: [["fecha"]],
      })
    ).toBe(false);
  });
});

describe("resolveDashboardFilterOperator", () => {
  it("keeps temporal ops on date fields", () => {
    expect(
      resolveDashboardFilterOperator({
        field: "fecha",
        operator: "MONTH",
        etlDateFields: ["fecha"],
      })
    ).toBe("MONTH");
  });

  it("defaults to YEAR when date field has comparison op", () => {
    expect(
      resolveDashboardFilterOperator({
        field: "join_0_fechacomprobante",
        operator: "=",
      })
    ).toBe("YEAR");
  });

  it("keeps = for non-date fields", () => {
    expect(
      resolveDashboardFilterOperator({
        field: "cliente",
        operator: "=",
      })
    ).toBe("=");
  });
});

describe("isDashboardDateFilterOperator", () => {
  it("recognizes known ops", () => {
    expect(isDashboardDateFilterOperator("year")).toBe(true);
    expect(isDashboardDateFilterOperator("IN")).toBe(false);
  });
});
