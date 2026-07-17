export const DASHBOARD_VIEWER_FILTERS_STORAGE_VERSION = 1 as const;

export type PersistedDashboardViewerFilters = {
  version: typeof DASHBOARD_VIEWER_FILTERS_STORAGE_VERSION;
  /** Valores aplicados (lo que filtra los datos). */
  filters: Record<string, unknown>;
  /** Borrador en UI (modo «Aplicar filtros»); opcional. */
  filterDraft?: Record<string, unknown>;
  dimensionDefaultFilterValues: Record<string, Record<string, unknown>>;
  activePageId?: string;
  updatedAt: string;
};

function storageKey(dashboardId: string, userId?: string | null): string {
  const uid = userId && String(userId).trim() ? String(userId).trim() : "anon";
  return `biconic:dashboard-viewer-filters:${uid}:${dashboardId}`;
}

/** Clave legacy (sin userId) para migrar sesiones guardadas antes del scope por usuario. */
function legacyStorageKey(dashboardId: string): string {
  return `biconic:dashboard-viewer-filters:${dashboardId}`;
}

function isEmptyFilterValue(v: unknown): boolean {
  if (v === "" || v === null || v === undefined) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

export function collectDashboardFilterIds(
  globalFilters: Array<{ id: string }>,
  widgetList: Array<{ id: string; type?: string }>
): Set<string> {
  const ids = new Set<string>();
  for (const gf of globalFilters) {
    if (gf.id) ids.add(gf.id);
  }
  for (const w of widgetList) {
    if (w.type === "filter" && w.id) ids.add(w.id);
  }
  return ids;
}

/** Fusiona valores persistidos sobre los defaults del layout (persistidos ganan si no están vacíos). */
export function mergeFilterValuesFromPersistence(
  defaults: Record<string, unknown>,
  persisted: Record<string, unknown> | undefined,
  validIds: Set<string>
): Record<string, unknown> {
  const out = { ...defaults };
  if (!persisted) return out;
  for (const [id, val] of Object.entries(persisted)) {
    if (!validIds.has(id) || isEmptyFilterValue(val)) continue;
    out[id] = val;
  }
  return out;
}

export function mergeDimensionDefaultsFromPersistence(
  seeded: Record<string, Record<string, unknown>>,
  persisted: Record<string, Record<string, unknown>> | undefined,
  widgets: Array<{
    id: string;
    aggregationConfig?: { dimensionDefaultFilters?: Array<{ id: string }> };
  }>
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [wId, per] of Object.entries(seeded)) {
    out[wId] = { ...per };
  }
  if (!persisted) return out;

  for (const w of widgets) {
    const wId = w.id;
    const persistedWidget = persisted[wId];
    if (!persistedWidget || typeof persistedWidget !== "object") continue;
    const ddfs = w.aggregationConfig?.dimensionDefaultFilters;
    if (!Array.isArray(ddfs) || ddfs.length === 0) continue;
    const validDdfIds = new Set(ddfs.map((d) => String(d.id ?? "").trim()).filter(Boolean));
    if (!out[wId]) out[wId] = {};
    for (const [ddfId, val] of Object.entries(persistedWidget)) {
      if (!validDdfIds.has(ddfId) || isEmptyFilterValue(val)) continue;
      out[wId]![ddfId] = val;
    }
  }
  return out;
}

export function loadPersistedDashboardViewerFilters(
  dashboardId: string,
  userId?: string | null
): PersistedDashboardViewerFilters | null {
  if (typeof window === "undefined" || !dashboardId.trim()) return null;
  try {
    const key = storageKey(dashboardId, userId);
    let raw = window.localStorage.getItem(key);
    if (!raw && userId) {
      // Migrar una vez desde la clave legacy sin userId (admin/viewer mismo dispositivo).
      const legacy = window.localStorage.getItem(legacyStorageKey(dashboardId));
      if (legacy) {
        raw = legacy;
        window.localStorage.setItem(key, legacy);
      }
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDashboardViewerFilters;
    if (parsed?.version !== DASHBOARD_VIEWER_FILTERS_STORAGE_VERSION) return null;
    if (!parsed.filters || typeof parsed.filters !== "object") return null;
    if (!parsed.dimensionDefaultFilterValues || typeof parsed.dimensionDefaultFilterValues !== "object") {
      parsed.dimensionDefaultFilterValues = {};
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedDashboardViewerFilters(
  dashboardId: string,
  data: Omit<PersistedDashboardViewerFilters, "version" | "updatedAt">,
  userId?: string | null
): void {
  if (typeof window === "undefined" || !dashboardId.trim()) return;
  try {
    const payload: PersistedDashboardViewerFilters = {
      version: DASHBOARD_VIEWER_FILTERS_STORAGE_VERSION,
      filters: data.filters,
      ...(data.filterDraft ? { filterDraft: data.filterDraft } : {}),
      dimensionDefaultFilterValues: data.dimensionDefaultFilterValues,
      ...(data.activePageId ? { activePageId: data.activePageId } : {}),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(
      storageKey(dashboardId, userId),
      JSON.stringify(payload)
    );
  } catch {
    // quota / private mode
  }
}
