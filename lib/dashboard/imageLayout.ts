import type { CSSProperties } from "react";

export type ImageSizePreset = "small" | "medium" | "large" | "full" | "custom";
export type ImageVerticalAlign = "top" | "center" | "bottom";
export type ImageHorizontalAlign = "left" | "center" | "right";
export type ImageObjectFit = "contain" | "cover" | "fill" | "none" | "scale-down";

export type DashboardImageConfig = {
  width?: number;
  height?: number;
  maxWidthPercent?: number;
  sizePreset?: ImageSizePreset;
  objectFit?: ImageObjectFit;
  opacity?: number;
  verticalAlign?: ImageVerticalAlign;
  horizontalAlign?: ImageHorizontalAlign;
  preserveAspectRatio?: boolean;
};

export const DEFAULT_IMAGE_CONFIG: DashboardImageConfig = {
  objectFit: "contain",
  preserveAspectRatio: true,
  verticalAlign: "center",
  horizontalAlign: "center",
  sizePreset: "medium",
  opacity: 1,
};

const SIZE_PRESET_PERCENT: Record<Exclude<ImageSizePreset, "custom">, number> = {
  small: 35,
  medium: 55,
  large: 75,
  full: 100,
};

export const IMAGE_SIZE_PRESET_OPTIONS: { value: ImageSizePreset; label: string }[] = [
  { value: "small", label: "Pequeño" },
  { value: "medium", label: "Mediano" },
  { value: "large", label: "Grande" },
  { value: "full", label: "Ajustar al contenedor" },
  { value: "custom", label: "Personalizado (px)" },
];

export const IMAGE_VERTICAL_ALIGN_OPTIONS: { value: ImageVerticalAlign; label: string }[] = [
  { value: "top", label: "Arriba" },
  { value: "center", label: "Centro" },
  { value: "bottom", label: "Abajo" },
];

export const IMAGE_HORIZONTAL_ALIGN_OPTIONS: { value: ImageHorizontalAlign; label: string }[] = [
  { value: "left", label: "Izquierda" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Derecha" },
];

export const IMAGE_OBJECT_FIT_OPTIONS: { value: ImageObjectFit; label: string }[] = [
  { value: "contain", label: "Completa sin recortar" },
  { value: "scale-down", label: "Reducir si es necesario" },
  { value: "cover", label: "Llenar (puede recortar)" },
  { value: "fill", label: "Estirar al contenedor" },
  { value: "none", label: "Tamaño original" },
];

export function resolveImageSizePercent(config?: DashboardImageConfig | null): number | undefined {
  if (!config) return SIZE_PRESET_PERCENT.medium;
  const preset = config.sizePreset ?? "medium";
  if (preset === "custom") {
    if (config.maxWidthPercent != null && Number.isFinite(config.maxWidthPercent)) {
      return Math.min(100, Math.max(10, config.maxWidthPercent));
    }
    if (config.width != null || config.height != null) return undefined;
    return SIZE_PRESET_PERCENT.medium;
  }
  return SIZE_PRESET_PERCENT[preset];
}

export function resolveImageContainerAlignment(config?: DashboardImageConfig | null): string {
  const v = config?.verticalAlign ?? "center";
  const h = config?.horizontalAlign ?? "center";
  const items =
    v === "top" ? "items-start" : v === "bottom" ? "items-end" : "items-center";
  const justify =
    h === "left" ? "justify-start" : h === "right" ? "justify-end" : "justify-center";
  return `flex flex-1 overflow-hidden ${items} ${justify}`;
}

function resolveObjectFit(config?: DashboardImageConfig | null): ImageObjectFit {
  const preserve = config?.preserveAspectRatio !== false;
  if (preserve) {
    const fit = config?.objectFit;
    if (fit === "cover" || fit === "fill") return "contain";
    return fit ?? "contain";
  }
  return config?.objectFit ?? "contain";
}

export function resolveImageElementStyle(config?: DashboardImageConfig | null): CSSProperties {
  const merged = { ...DEFAULT_IMAGE_CONFIG, ...config };
  const preserve = merged.preserveAspectRatio !== false;
  const sizePercent = resolveImageSizePercent(merged);
  const isCustom = merged.sizePreset === "custom";
  const style: CSSProperties = {
    objectFit: resolveObjectFit(merged),
    opacity:
      merged.opacity != null && Number.isFinite(merged.opacity)
        ? Math.min(1, Math.max(0, merged.opacity))
        : 1,
  };

  if (isCustom) {
    if (merged.width != null && Number.isFinite(merged.width) && merged.width > 0) {
      style.width = merged.width;
    }
    if (merged.height != null && Number.isFinite(merged.height) && merged.height > 0) {
      style.height = merged.height;
    }
    if (!style.width && !style.height && sizePercent != null) {
      style.maxWidth = `${sizePercent}%`;
      style.maxHeight = `${sizePercent}%`;
    }
  } else if (sizePercent != null) {
    style.maxWidth = `${sizePercent}%`;
    style.maxHeight = `${sizePercent}%`;
    style.width = "auto";
    style.height = "auto";
  }

  if (preserve) {
    style.objectFit = resolveObjectFit(merged);
  }

  return style;
}

export type ContentIconSize = "sm" | "md" | "lg";

export const CONTENT_ICON_SIZE_OPTIONS: { value: ContentIconSize; label: string }[] = [
  { value: "sm", label: "Pequeño" },
  { value: "md", label: "Mediano" },
  { value: "lg", label: "Grande" },
];

export function contentIconSizeClass(size?: ContentIconSize | null): string {
  switch (size ?? "md") {
    case "sm":
      return "h-5 w-5";
    case "lg":
      return "h-10 w-10";
    default:
      return "h-7 w-7";
  }
}
