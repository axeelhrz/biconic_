import { describe, expect, it } from "vitest";
import {
  isDashboardDateFilterOperator,
  isDashboardFilterDateField,
  looksLikeDateFieldName,
  resolveDashboardFilterOperator,
} from "@/lib/dashboard/isDashboardFilterDateField";

describe("looksLikeDateFieldName", () => {
  it("matches unambiguous date columns", () => {
    expect(looksLikeDateFieldName("join_0_fechacomprobante")).toBe(true);
    expect(looksLikeDateFieldName("fecha_venta")).toBe(true);
    expect(looksLikeDateFieldName("DATE")).toBe(true);
  });

  it("rejects non-date and ambiguous temporal labels", () => {
    expect(looksLikeDateFieldName("cliente")).toBe(false);
    expect(looksLikeDateFieldName("importe_total")).toBe(false);
    expect(looksLikeDateFieldName("mes")).toBe(false);
    expect(looksLikeDateFieldName("periodo")).toBe(false);
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

  it("does not treat date-like names as temporal without metadata", () => {
    expect(
      isDashboardFilterDateField("join_0_fechacomprobante", {
        etlDateFields: [],
        dataSourceDateFields: [[]],
      })
    ).toBe(false);
    expect(
      isDashboardFilterDateField("mes", {
        etlDateFields: [],
        dataSourceDateFields: [[]],
      })
    ).toBe(false);
    expect(
      isDashboardFilterDateField("periodo", {
        etlDateFields: ["fecha"],
      })
    ).toBe(false);
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

  it("defaults to YEAR when mapped date field has comparison op", () => {
    expect(
      resolveDashboardFilterOperator({
        field: "join_0_fechacomprobante",
        operator: "=",
        etlDateFields: ["join_0_fechacomprobante"],
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

  it("resets temporal ops when field is not a mapped date", () => {
    expect(
      resolveDashboardFilterOperator({
        field: "mes",
        operator: "YEAR",
        etlDateFields: ["fecha"],
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
