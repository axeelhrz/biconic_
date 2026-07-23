import { describe, expect, it } from "vitest";
import {
  heightPxForRowSpan,
  minRowSpanForMinHeight,
  snapMinHeightToGrid,
} from "./gridLayout";

describe("snapMinHeightToGrid", () => {
  it("round-trips: snapped height yields the same rowSpan", () => {
    for (const raw of [200, 280, 300, 350, 360, 400, 520, 700]) {
      const { minHeight, rowSpan } = snapMinHeightToGrid(raw);
      expect(minRowSpanForMinHeight(minHeight)).toBe(rowSpan);
      expect(heightPxForRowSpan(rowSpan)).toBe(minHeight);
    }
  });

  it("snapped height is >= requested height", () => {
    for (const raw of [201, 281, 333, 401]) {
      const { minHeight } = snapMinHeightToGrid(raw);
      expect(minHeight).toBeGreaterThanOrEqual(raw);
    }
  });
});
