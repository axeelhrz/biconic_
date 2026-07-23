/** Normaliza el nombre de una métrica guardada para comparar unicidad. */
export function normalizeSavedMetricName(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export type SavedMetricNameLike = { id?: string; name?: string };

/**
 * Busca otra métrica con el mismo nombre (case-insensitive).
 * `excludeId` permite ignorar la métrica en edición.
 */
export function findDuplicateSavedMetricName(
  metrics: SavedMetricNameLike[] | null | undefined,
  name: string,
  excludeId?: string | null
): SavedMetricNameLike | null {
  const target = normalizeSavedMetricName(name);
  if (!target || !Array.isArray(metrics)) return null;
  const exclude = excludeId != null && String(excludeId).trim() !== "" ? String(excludeId) : null;
  for (const m of metrics) {
    if (!m) continue;
    if (exclude && String(m.id ?? "") === exclude) continue;
    if (normalizeSavedMetricName(String(m.name ?? "")) === target) return m;
  }
  return null;
}

/** Devuelve el primer nombre duplicado dentro de la misma lista, o null. */
export function findDuplicateNameWithinList(metrics: SavedMetricNameLike[] | null | undefined): string | null {
  if (!Array.isArray(metrics) || metrics.length === 0) return null;
  const seen = new Map<string, string>();
  for (const m of metrics) {
    const raw = String(m?.name ?? "").trim();
    const key = normalizeSavedMetricName(raw);
    if (!key) continue;
    if (seen.has(key)) return raw || key;
    seen.set(key, String(m?.id ?? ""));
  }
  return null;
}
