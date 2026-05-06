"use client";

import { useEffect, useState } from "react";
import {
  DASHBOARD_GRID_COLUMN_COUNT,
  DASHBOARD_GRID_ROW_GAP_PX_DEFAULT,
  packRowGapPxClient,
  packRowGapPxStudio,
} from "@/lib/dashboard/gridLayout";

const PACK_LAYOUT_RESIZE_DEBOUNCE_MS = 120;

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
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const applyLayout = () => {
      const w = window.innerWidth;
      setLayout({
        packCols: variant === "studio" ? packColumnCountStudio(w) : packColumnCountClient(w),
        packRowGapPx: variant === "studio" ? packRowGapPxStudio(w) : packRowGapPxClient(w),
      });
    };

    const scheduleLayout = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutId = undefined;
        applyLayout();
      }, PACK_LAYOUT_RESIZE_DEBOUNCE_MS);
    };

    applyLayout();
    window.addEventListener("resize", scheduleLayout);
    return () => {
      window.removeEventListener("resize", scheduleLayout);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [variant]);

  return layout;
}

export function useDashboardPackColumnCount(variant: "studio" | "client"): number {
  return useDashboardPackLayout(variant).packCols;
}
