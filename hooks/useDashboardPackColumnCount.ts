"use client";

import { useEffect, useState } from "react";
import {
  DASHBOARD_GRID_COLUMN_COUNT,
  DASHBOARD_GRID_ROW_GAP_PX_DEFAULT,
  packRowGapPxClient,
  packRowGapPxStudio,
} from "@/lib/dashboard/gridLayout";

/** Debe coincidir con breakpoints de `.studio-blocks` en studio.css */
export function packColumnCountStudio(width: number): number {
  if (width >= 1280) return DASHBOARD_GRID_COLUMN_COUNT;
  if (width >= 768) return 2;
  return 1;
}

/** Debe coincidir con `.client-view-grid` en client-dashboard-view.css */
export function packColumnCountClient(width: number): number {
  if (width >= 1024) return DASHBOARD_GRID_COLUMN_COUNT;
  if (width >= 640) return 2;
  return 1;
}

export type DashboardPackLayout = {
  packCols: number;
  packRowGapPx: number;
};

export function useDashboardPackLayout(variant: "studio" | "client"): DashboardPackLayout {
  const [layout, setLayout] = useState<DashboardPackLayout>(() => {
    if (typeof window === "undefined") {
      return { packCols: DASHBOARD_GRID_COLUMN_COUNT, packRowGapPx: DASHBOARD_GRID_ROW_GAP_PX_DEFAULT };
    }
    const w = window.innerWidth;
    return {
      packCols: variant === "studio" ? packColumnCountStudio(w) : packColumnCountClient(w),
      packRowGapPx: variant === "studio" ? packRowGapPxStudio(w) : packRowGapPxClient(w),
    };
  });

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setLayout({
        packCols: variant === "studio" ? packColumnCountStudio(w) : packColumnCountClient(w),
        packRowGapPx: variant === "studio" ? packRowGapPxStudio(w) : packRowGapPxClient(w),
      });
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [variant]);

  return layout;
}

export function useDashboardPackColumnCount(variant: "studio" | "client"): number {
  return useDashboardPackLayout(variant).packCols;
}
