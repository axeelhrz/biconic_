"use client";

import type { DashboardTheme } from "@/types/dashboard";
import { themeToLogoOverlayStyle } from "@/types/dashboard";

type DashboardLogoOverlayProps = {
  theme: DashboardTheme;
  className?: string;
};

export function DashboardLogoOverlay({ theme, className = "" }: DashboardLogoOverlayProps) {
  const styles = themeToLogoOverlayStyle(theme);
  const url = theme.logoUrl?.trim();
  if (!styles || !url) return null;

  return (
    <div
      className={`client-view-logo-bg ${className}`.trim()}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        ...styles.containerStyle,
      }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- URL arbitraria del tema */}
      <img src={url} alt="" className="client-view-logo-img" style={styles.imgStyle} />
    </div>
  );
}
