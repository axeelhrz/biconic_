import { describe, expect, it } from "vitest";
import {
  DASHBOARD_CARD_PLACEHOLDER_IMAGE,
  isDashboardCustomCoverUrl,
  resolveDashboardCoverImageUrl,
} from "@/lib/dashboard/dashboardCoverImage";

describe("resolveDashboardCoverImageUrl", () => {
  it("prioriza coverImageUrl explícito y layout", () => {
    expect(
      resolveDashboardCoverImageUrl({
        coverImageUrl: "https://cdn.example/cover.jpg",
        layout: { coverImageUrl: "https://cdn.example/other.jpg" },
      })
    ).toBe("https://cdn.example/cover.jpg");

    expect(
      resolveDashboardCoverImageUrl({
        layout: { coverImageUrl: "https://cdn.example/from-layout.png" },
        image_url: "https://cdn.example/col.jpg",
      })
    ).toBe("https://cdn.example/from-layout.png");
  });

  it("usa columnas legacy y placeholder", () => {
    expect(resolveDashboardCoverImageUrl({ image_url: "https://x/a.jpg" })).toBe("https://x/a.jpg");
    expect(resolveDashboardCoverImageUrl({})).toBe(DASHBOARD_CARD_PLACEHOLDER_IMAGE);
    expect(isDashboardCustomCoverUrl("/Image.svg")).toBe(false);
  });
});
