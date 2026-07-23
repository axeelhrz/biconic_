/**
 * Métricas y análisis reutilizables viven a nivel Dataset (`public.dataset.config`),
 * no del ETL. El layout del ETL queda solo como fallback legacy.
 */

export type DatasetConfigBag = Record<string, unknown>;

export function readSavedMetricsFromDatasetConfig(config: unknown): unknown[] {
  if (!config || typeof config !== "object") return [];
  const c = config as DatasetConfigBag;
  if (Array.isArray(c.saved_metrics)) return c.saved_metrics;
  if (Array.isArray(c.savedMetrics)) return c.savedMetrics;
  return [];
}

export function readSavedAnalysesFromDatasetConfig(config: unknown): unknown[] {
  if (!config || typeof config !== "object") return [];
  const c = config as DatasetConfigBag;
  if (Array.isArray(c.saved_analyses)) return c.saved_analyses;
  if (Array.isArray(c.savedAnalyses)) return c.savedAnalyses;
  return [];
}

/** Merge de artefactos de métricas/análisis encima del config semántico del dataset. */
export function mergeDatasetConfigArtifacts(
  existingConfig: unknown,
  patch: {
    savedMetrics?: unknown[];
    savedAnalyses?: unknown[];
    datasetConfig?: Record<string, unknown>;
  }
): DatasetConfigBag {
  const base =
    existingConfig && typeof existingConfig === "object"
      ? { ...(existingConfig as DatasetConfigBag) }
      : {};
  const semantic =
    patch.datasetConfig && typeof patch.datasetConfig === "object"
      ? { ...patch.datasetConfig }
      : {};
  const next: DatasetConfigBag = { ...base, ...semantic };
  if (patch.savedMetrics !== undefined) {
    next.saved_metrics = JSON.parse(JSON.stringify(patch.savedMetrics));
    delete next.savedMetrics;
  }
  if (patch.savedAnalyses !== undefined) {
    next.saved_analyses = JSON.parse(JSON.stringify(patch.savedAnalyses));
    delete next.savedAnalyses;
  }
  return next;
}

/** Preferir artefactos del dataset; si están vacíos, usar el layout del ETL (legacy). */
export function resolveSavedArtifacts(opts: {
  datasetConfig?: unknown;
  etlLayout?: unknown;
}): { savedMetrics: unknown[]; savedAnalyses: unknown[] } {
  const fromDsMetrics = readSavedMetricsFromDatasetConfig(opts.datasetConfig);
  const fromDsAnalyses = readSavedAnalysesFromDatasetConfig(opts.datasetConfig);
  const layout =
    opts.etlLayout && typeof opts.etlLayout === "object"
      ? (opts.etlLayout as DatasetConfigBag)
      : null;
  const fromEtlMetrics = Array.isArray(layout?.saved_metrics)
    ? layout!.saved_metrics
    : Array.isArray(layout?.savedMetrics)
      ? (layout!.savedMetrics as unknown[])
      : [];
  const fromEtlAnalyses = Array.isArray(layout?.saved_analyses)
    ? layout!.saved_analyses
    : Array.isArray(layout?.savedAnalyses)
      ? (layout!.savedAnalyses as unknown[])
      : [];
  return {
    savedMetrics: fromDsMetrics.length > 0 ? fromDsMetrics : fromEtlMetrics,
    savedAnalyses: fromDsAnalyses.length > 0 ? fromDsAnalyses : fromEtlAnalyses,
  };
}
