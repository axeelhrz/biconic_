/**
 * Tema visual del dashboard (vista cliente).
 * Colores y tipografía editables por el cliente en el editor.
 */
export type DashboardTheme = {
  /** Color de acento: gráficos, líneas, barras, logo (ej. teal #14b8a6) */
  accentColor?: string;
  /** Fondo principal del área del dashboard */
  backgroundColor?: string;
  /** Fondo de las tarjetas/widgets */
  cardBackgroundColor?: string;
  /** Color del texto principal */
  textColor?: string;
  /** Color del texto secundario */
  textMutedColor?: string;
  /** Fondo del panel de filtros (lateral derecho) */
  filtersPanelBackground?: string;
  /** Color del encabezado del dashboard (barra con título) */
  headerBackgroundColor?: string;
  /** Familia tipográfica (ej. 'DM Sans', system-ui) */
  fontFamily?: string;
  /** Tamaño base del título del dashboard (rem) */
  headerFontSize?: number;
  /** Tamaño del título de tarjeta (rem) */
  cardTitleFontSize?: number;
  /** Tamaño del valor principal en KPI (rem) */
  kpiValueFontSize?: number;
  /** URL del logo (imagen de fondo/watermark) */
  logoUrl?: string;
  /** Tamaño máximo del logo: porcentaje del ancho del área (0-100) o px si > 100 */
  logoSize?: number;
  /** Opacidad del logo de fondo (0-1). Ej: 0.08 = watermark sutil */
  logoOpacity?: number;
  /** Posición del logo: center | top-left | top-right | bottom-left | bottom-right */
  logoPosition?: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Imagen de fondo del dashboard (URL) */
  backgroundImageUrl?: string;
  /** Color del borde de las tarjetas */
  cardBorderColor?: string;
  /** Grosor del borde de las tarjetas (px) */
  cardBorderWidth?: number;
  /** Radio del borde de las tarjetas (px) */
  cardBorderRadius?: number;
}

export const DEFAULT_DASHBOARD_THEME: DashboardTheme = {
  accentColor: "#2dd4bf",
  backgroundColor: "#111318",
  cardBackgroundColor: "rgba(255,255,255,0.03)",
  textColor: "#ffffff",
  textMutedColor: "rgba(255,255,255,0.75)",
  filtersPanelBackground: "#ffffff",
  headerBackgroundColor: "#1f2328",
  fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
  headerFontSize: 1.25,
  cardTitleFontSize: 0.8125,
  kpiValueFontSize: 1.25,
  logoUrl: "",
  logoSize: 24,
  logoOpacity: 0.06,
  logoPosition: "center",
  backgroundImageUrl: "",
  cardBorderColor: "rgba(255,255,255,0.08)",
  cardBorderWidth: 1,
  cardBorderRadius: 20,
};

export function mergeTheme(partial?: DashboardTheme | null): DashboardTheme {
  if (!partial || typeof partial !== "object") return { ...DEFAULT_DASHBOARD_THEME };
  return {
    ...DEFAULT_DASHBOARD_THEME,
    ...partial,
  };
}

/** Tema efectivo de una tarjeta: global del layout + overrides por widget (`cardTheme`). */
export function mergeCardTheme(global: DashboardTheme, card?: Partial<DashboardTheme> | null): DashboardTheme {
  if (!card || typeof card !== "object") return { ...global };
  return { ...global, ...card };
}

/**
 * Variables CSS alineadas con la vista cliente (`DashboardWidgetRenderer`, cabeceras).
 * `theme` debe ser un tema ya resuelto (p. ej. tras `mergeTheme` o `mergeCardTheme`).
 */
export function themeToCssVars(theme: DashboardTheme): Record<string, string> {
  const bg = theme.backgroundColor ?? DEFAULT_DASHBOARD_THEME.backgroundColor ?? "";
  const cardBg = theme.cardBackgroundColor ?? DEFAULT_DASHBOARD_THEME.cardBackgroundColor ?? "";
  const borderColor = theme.cardBorderColor ?? DEFAULT_DASHBOARD_THEME.cardBorderColor ?? "";
  const borderWidth = theme.cardBorderWidth ?? DEFAULT_DASHBOARD_THEME.cardBorderWidth ?? 1;
  const radius = theme.cardBorderRadius ?? DEFAULT_DASHBOARD_THEME.cardBorderRadius ?? 20;
  const textColor = theme.textColor ?? DEFAULT_DASHBOARD_THEME.textColor ?? "";
  const textMutedColor = theme.textMutedColor ?? DEFAULT_DASHBOARD_THEME.textMutedColor ?? "";
  const fontFamily = theme.fontFamily ?? DEFAULT_DASHBOARD_THEME.fontFamily ?? "";
  const accent = theme.accentColor ?? DEFAULT_DASHBOARD_THEME.accentColor ?? "";
  return {
    "--client-font": fontFamily,
    "--client-header-font-size": `${theme.headerFontSize ?? DEFAULT_DASHBOARD_THEME.headerFontSize ?? 1.25}rem`,
    "--client-card-title-font-size": `${theme.cardTitleFontSize ?? DEFAULT_DASHBOARD_THEME.cardTitleFontSize ?? 0.8125}rem`,
    "--client-kpi-value-font-size": `${theme.kpiValueFontSize ?? DEFAULT_DASHBOARD_THEME.kpiValueFontSize ?? 1.25}rem`,
    "--client-accent": accent,
    "--client-bg": bg,
    "--client-card": cardBg,
    "--client-text": textColor,
    "--client-text-muted": textMutedColor,
    "--client-border": borderColor,
    "--client-border-width": `${borderWidth}px`,
    "--client-radius": `${radius}px`,
    "--platform-surface": cardBg,
    "--platform-border": borderColor,
    "--platform-card-border-width": `${borderWidth}px`,
    "--platform-card-radius": `${radius}px`,
    "--platform-fg": textColor,
    "--platform-fg-muted": textMutedColor,
  };
}

/** Fondo del contenedor (página o celda de widget) según color e imagen del tema. */
export function themeToWrapperBackground(theme: DashboardTheme): {
  backgroundColor: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
} {
  const bg = theme.backgroundColor ?? DEFAULT_DASHBOARD_THEME.backgroundColor ?? "";
  const url = theme.backgroundImageUrl?.trim();
  if (url) {
    const safeUrl = url.replace(/"/g, "%22");
    return {
      backgroundColor: bg,
      backgroundImage: `url("${safeUrl}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }
  return { backgroundColor: bg };
}
