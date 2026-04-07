"use client";

import { useEffect, useState } from "react";
import { DASHBOARD_GRID_COLUMN_COUNT } from "@/lib/dashboard/gridLayout";

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

export function useDashboardPackColumnCount(variant: "studio" | "client"): number {
  const [cols, setCols] = useState(DASHBOARD_GRID_COLUMN_COUNT);

  useEffect(() => {
    const pack = variant === "studio" ? packColumnCountStudio : packColumnCountClient;
    const onResize = () => setCols(pack(window.innerWidth));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [variant]);

  return cols;
}
