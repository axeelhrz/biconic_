import { describe, expect, it } from "vitest";
import {
  isMultiSelectFilterInput,
  normalizeLoadedGlobalFilter,
  reconcileFilterOperatorWithInputType,
  resolveFilterInputType,
  shouldApplyFilterAsIn,
  wantsSelectableFilterControl,
} from "./filterInputType";

describe("resolveFilterInputType", () => {
  it("infiere multi desde operator IN legacy", () => {
    expect(resolveFilterInputType({ operator: "IN" })).toBe("multi");
  });

  it("default select sin inputType ni IN", () => {
    expect(resolveFilterInputType({ operator: "=" })).toBe("select");
  });

  it("respeta inputType explícito", () => {
    expect(resolveFilterInputType({ inputType: "search", operator: "IN" })).toBe("search");
  });
});

describe("isMultiSelectFilterInput", () => {
  it("respeta inputType multi", () => {
    expect(isMultiSelectFilterInput({ inputType: "multi", operator: "=" })).toBe(true);
  });

  it("no fuerza multi si inputType es select aunque operator sea IN", () => {
    expect(isMultiSelectFilterInput({ inputType: "select", operator: "IN" })).toBe(false);
  });

  it("infiere multi desde IN cuando no hay inputType (legacy)", () => {
    expect(isMultiSelectFilterInput({ operator: "IN" })).toBe(true);
    expect(isMultiSelectFilterInput({ operator: "=" })).toBe(false);
  });
});

describe("wantsSelectableFilterControl", () => {
  it("select y multi quieren opciones", () => {
    expect(wantsSelectableFilterControl({ inputType: "select" })).toBe(true);
    expect(wantsSelectableFilterControl({ inputType: "multi" })).toBe(true);
    expect(wantsSelectableFilterControl({ inputType: "search" })).toBe(false);
  });
});

describe("reconcileFilterOperatorWithInputType", () => {
  it("pone IN al elegir multi", () => {
    expect(
      reconcileFilterOperatorWithInputType({ inputType: "multi", operator: "=", isDateField: false })
    ).toBe("IN");
  });

  it("limpia IN stale al elegir select", () => {
    expect(
      reconcileFilterOperatorWithInputType({ inputType: "select", operator: "IN", isDateField: false })
    ).toBe("=");
  });

  it("no toca operadores de fecha", () => {
    expect(
      reconcileFilterOperatorWithInputType({
        inputType: "multi",
        operator: "YEAR",
        isDateField: true,
      })
    ).toBe("YEAR");
  });
});

describe("shouldApplyFilterAsIn", () => {
  it("usa multi por inputType aunque operator sea =", () => {
    expect(
      shouldApplyFilterAsIn({ inputType: "multi", operator: "=", value: ["a", "b"] })
    ).toBe(true);
  });

  it("no usa IN si inputType es select aunque operator sea IN", () => {
    expect(
      shouldApplyFilterAsIn({ inputType: "select", operator: "IN", value: "a" })
    ).toBe(false);
  });
});

describe("normalizeLoadedGlobalFilter", () => {
  it("promueve IN legacy a multi", () => {
    const n = normalizeLoadedGlobalFilter({ id: "1", field: "x", operator: "IN" });
    expect(n.inputType).toBe("multi");
    expect(n.operator).toBe("IN");
  });

  it("no convierte select+IN en multi", () => {
    const n = normalizeLoadedGlobalFilter({ field: "x", inputType: "select", operator: "IN" });
    expect(n.inputType).toBe("select");
    expect(n.operator).toBe("=");
  });
});
