import { describe, expect, it } from "vitest";
import { normalizeDistinctYearOptions } from "@/lib/dashboard/fetchGlobalFilterDistinctValues";

describe("normalizeDistinctYearOptions", () => {
  it("extracts years from ISO timestamps", () => {
    expect(
      normalizeDistinctYearOptions([
        "2019-12-26T00:00:00+00:00",
        "2020-03-09T00:00:00+00:00",
        "2020-03-10T00:00:00+00:00",
      ])
    ).toEqual(["2019", "2020"]);
  });

  it("keeps plain years", () => {
    expect(normalizeDistinctYearOptions([2024, "2025", "1999"])).toEqual(["1999", "2024", "2025"]);
  });

  it("parses DD/MM/YYYY", () => {
    expect(normalizeDistinctYearOptions(["15/03/2021", "01/01/2021"])).toEqual(["2021"]);
  });
});
