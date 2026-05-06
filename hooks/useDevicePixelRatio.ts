"use client";

import { useEffect, useState } from "react";

/** Límite superior para no inflar demasiado el buffer del canvas en pantallas muy densas. */
const MAX_CHART_DPR = 2.25;

function readChartDevicePixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(MAX_CHART_DPR, window.devicePixelRatio || 1);
}

/**
 * DPR actual para Chart.js: se actualiza en resize y visualViewport (zoom del navegador / móvil).
 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(readChartDevicePixelRatio);

  useEffect(() => {
    const sync = () => {
      const next = readChartDevicePixelRatio();
      setDpr((prev) => (prev === next ? prev : next));
    };
    sync();
    window.addEventListener("resize", sync);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("resize", sync);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
    };
  }, []);

  return dpr;
}
