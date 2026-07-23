import { describe, expect, it } from "vitest";
import { formatValue } from "@/lib/dashboard/chartOptions";

describe("formatValue percent", () => {
  it("multiplica ratio por 100 y agrega %", () => {
    expect(formatValue(0.15, "percent", "$", "none", 2)).toBe("15%");
    expect(formatValue(1, "percent", "$", "none", 0)).toBe("100%");
    expect(formatValue(0.125, "percent", "$", "none", 1)).toBe("12,5%");
  });

  it("no altera number/currency con la regla de percent", () => {
    expect(formatValue(15, "none", "$", "none", 0)).toBe("15");
    expect(formatValue(15, "currency", "$", "none", 0)).toBe("$15");
  });
});
