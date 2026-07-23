/**
 * Imagen de portada del dashboard (tarjeta de listado en admin/viewer).
 * Persistida en `dashboard.layout.coverImageUrl`.
 */

export const DASHBOARD_CARD_PLACEHOLDER_IMAGE = "/Image.svg";

export function isDashboardCustomCoverUrl(url: string | null | undefined): boolean {
  const u = String(url ?? "").trim();
  return u !== "" && u !== DASHBOARD_CARD_PLACEHOLDER_IMAGE;
}

/** Extrae cover desde layout JSON (o columnas legacy image_url / thumbnail_url). */
export function resolveDashboardCoverImageUrl(params: {
  layout?: unknown;
  image_url?: unknown;
  thumbnail_url?: unknown;
  coverImageUrl?: unknown;
}): string {
  const fromExplicit = String(params.coverImageUrl ?? "").trim();
  if (isDashboardCustomCoverUrl(fromExplicit)) return fromExplicit;

  const layout = params.layout;
  if (layout && typeof layout === "object" && !Array.isArray(layout)) {
    const fromLayout = String((layout as { coverImageUrl?: unknown }).coverImageUrl ?? "").trim();
    if (isDashboardCustomCoverUrl(fromLayout)) return fromLayout;
  }

  const fromCol = String(params.image_url ?? "").trim();
  if (isDashboardCustomCoverUrl(fromCol)) return fromCol;

  const fromThumb = String(params.thumbnail_url ?? "").trim();
  if (isDashboardCustomCoverUrl(fromThumb)) return fromThumb;

  return DASHBOARD_CARD_PLACEHOLDER_IMAGE;
}
