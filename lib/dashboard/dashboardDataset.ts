/**
 * Dataset del Dashboard: capa semántica que unifica dimensiones entre ETLs.
 * Se genera automáticamente; correcciones manuales tienen origin "manual".
 */

export type DashboardDimensionType = "date" | "string" | "number";

export type DashboardDimensionMapping = {
  sourceId: string;
  physicalColumn: string;
  origin: "auto" | "manual";
  confidence?: number;
};

export type DashboardDimension = {
  id: string;
  label: string;
  type: DashboardDimensionType;
  mappings: DashboardDimensionMapping[];
};

export type DashboardDataset = {
  version: 1;
  dimensions: DashboardDimension[];
  /** Overrides de sinónimos por dimensión (futuro: por cliente) */
  synonymOverrides?: Record<string, string[]>;
  updatedAt: string;
};

export type DatasetDimensionRegistryEntry = {
  id: string;
  label: string;
  type: DashboardDimensionType;
  synonyms: string[];
};

/** Sinónimos por defecto para detección automática (extensible vía synonymOverrides). */
export const DEFAULT_DIMENSION_SYNONYMS: DatasetDimensionRegistryEntry[] = [
  {
    id: "date",
    label: "Fecha",
    type: "date",
    synonyms: [
      "fecha",
      "date",
      "created_at",
      "updated_at",
      "timestamp",
      "periodo",
      "period",
      "dia",
      "mes",
      "anio",
      "year",
      "datetime",
      "fecha_venta",
      "fecha_stock",
      "fecha_compra",
    ],
  },
  {
    id: "region",
    label: "Región",
    type: "string",
    synonyms: [
      "region",
      "provincia",
      "zona",
      "geo",
      "departamento",
      "state",
      "localidad",
      "ciudad",
      "municipio",
      "pais",
      "country",
    ],
  },
  {
    id: "product",
    label: "Producto",
    type: "string",
    synonyms: ["producto", "product", "sku", "item", "articulo", "article"],
  },
  {
    id: "category",
    label: "Categoría",
    type: "string",
    synonyms: ["categoria", "category", "rubro", "segmento", "segment", "familia"],
  },
  {
    id: "client",
    label: "Cliente",
    type: "string",
    synonyms: ["cliente", "client", "customer", "cuenta", "account", "comprador"],
  },
];

export const SEMANTIC_DIMENSION_LABELS: Record<string, string> = Object.fromEntries(
  DEFAULT_DIMENSION_SYNONYMS.map((d) => [d.id, d.label])
);

const AUTO_CONFIDENCE_THRESHOLD = 0.45;

export type DashboardSourceFields = {
  all: string[];
  numeric: string[];
  string: string[];
  date: string[];
};

export type DashboardSourceInput = {
  id: string;
  etlId: string;
  alias: string;
  fields: DashboardSourceFields;
  /** columnDisplay del guided_config: columna → { type?: string } */
  columnDisplay?: Record<string, { type?: string; label?: string }>;
};

export type DashboardDatasetWarnings = {
  unmappedSources: { dimensionId: string; sourceId: string; sourceAlias?: string }[];
  lowConfidence: { dimensionId: string; sourceId: string; physicalColumn: string; confidence: number }[];
};

export type BuildDashboardDatasetResult = {
  dataset: DashboardDataset;
  datasetDimensions: Record<string, Record<string, string>>;
  warnings: DashboardDatasetWarnings;
};

/** Normaliza nombre de columna para comparación de sinónimos. */
export function normalizeColumnName(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function getRegistry(
  synonymOverrides?: Record<string, string[]>
): DatasetDimensionRegistryEntry[] {
  if (!synonymOverrides || Object.keys(synonymOverrides).length === 0) {
    return DEFAULT_DIMENSION_SYNONYMS;
  }
  return DEFAULT_DIMENSION_SYNONYMS.map((entry) => ({
    ...entry,
    synonyms: [
      ...entry.synonyms,
      ...(synonymOverrides[entry.id] ?? []).map(normalizeColumnName),
    ],
  }));
}

function dateColumnsFromColumnDisplay(
  columnDisplay?: Record<string, { type?: string }>
): string[] {
  if (!columnDisplay) return [];
  return Object.keys(columnDisplay).filter((k) => {
    const t = String(columnDisplay[k]?.type ?? "").toLowerCase();
    return t === "fecha" || t === "date" || t === "datetime";
  });
}

function scoreColumnForDimension(
  column: string,
  dimension: DatasetDimensionRegistryEntry,
  fields: DashboardSourceFields
): number {
  const norm = normalizeColumnName(column);
  if (!norm) return 0;

  const synonyms = dimension.synonyms.map(normalizeColumnName);

  if (synonyms.includes(norm)) return 1;

  for (const syn of synonyms) {
    if (norm === syn) return 1;
    if (norm.endsWith(`_${syn}`) || norm.startsWith(`${syn}_`)) return 0.85;
    if (norm.includes(syn) && syn.length >= 4) return 0.7;
  }

  if (dimension.type === "date" && fields.date.includes(column)) return 0.65;
  if (dimension.type === "string" && fields.string.includes(column)) return 0.4;
  if (dimension.type === "number" && fields.numeric.includes(column)) return 0.35;

  return 0;
}

function detectBestColumn(
  source: DashboardSourceInput,
  dimension: DatasetDimensionRegistryEntry
): { column: string; confidence: number } | null {
  const candidates = new Set<string>([
    ...source.fields.all,
    ...dateColumnsFromColumnDisplay(source.columnDisplay),
  ]);

  if (dimension.id === "date") {
    const fromDisplay = dateColumnsFromColumnDisplay(source.columnDisplay);
    if (fromDisplay.length > 0) {
      const col = fromDisplay[0];
      return { column: col, confidence: 0.95 };
    }
    if (source.fields.date.length > 0) {
      return { column: source.fields.date[0], confidence: 0.8 };
    }
  }

  let best: { column: string; confidence: number } | null = null;
  for (const col of candidates) {
    const score = scoreColumnForDimension(col, dimension, source.fields);
    if (score < AUTO_CONFIDENCE_THRESHOLD) continue;
    if (!best || score > best.confidence) {
      best = { column: col, confidence: score };
    }
  }
  return best;
}

export function toLegacyDatasetDimensions(
  dataset: DashboardDataset
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const dim of dataset.dimensions) {
    const bySource: Record<string, string> = {};
    for (const m of dim.mappings) {
      if (m.physicalColumn) bySource[m.sourceId] = m.physicalColumn;
    }
    if (Object.keys(bySource).length > 0) out[dim.id] = bySource;
  }
  return out;
}

/** Convierte layout legacy (solo mapa plano) a DashboardDataset mínimo. */
export function dashboardDatasetFromLegacy(
  legacy: Record<string, Record<string, string>> | undefined,
  sources: { id: string }[]
): DashboardDataset | null {
  if (!legacy || Object.keys(legacy).length === 0) return null;
  const dimensions: DashboardDimension[] = [];
  for (const [dimId, bySource] of Object.entries(legacy)) {
    const registry = DEFAULT_DIMENSION_SYNONYMS.find((d) => d.id === dimId);
    const mappings: DashboardDimensionMapping[] = [];
    for (const source of sources) {
      const col = bySource[source.id];
      if (col) {
        mappings.push({
          sourceId: source.id,
          physicalColumn: col,
          origin: "manual",
          confidence: 1,
        });
      }
    }
    if (mappings.length > 0) {
      dimensions.push({
        id: dimId,
        label: registry?.label ?? dimId,
        type: registry?.type ?? "string",
        mappings,
      });
    }
  }
  if (dimensions.length === 0) return null;
  return { version: 1, dimensions, updatedAt: new Date().toISOString() };
}

function getManualMappings(
  saved: DashboardDataset | null | undefined,
  dimensionId: string,
  sourceId: string
): DashboardDimensionMapping | null {
  const dim = saved?.dimensions.find((d) => d.id === dimensionId);
  const m = dim?.mappings.find((x) => x.sourceId === sourceId && x.origin === "manual");
  return m ?? null;
}

/**
 * Construye el Dataset del Dashboard fusionando detección automática con guardado previo.
 */
export function buildDashboardDataset(
  sources: DashboardSourceInput[],
  saved?: DashboardDataset | null,
  options?: { synonymOverrides?: Record<string, string[]>; forceRebuild?: boolean }
): BuildDashboardDatasetResult {
  const registry = getRegistry(options?.synonymOverrides ?? saved?.synonymOverrides);
  const warnings: DashboardDatasetWarnings = { unmappedSources: [], lowConfidence: [] };
  const dimensions: DashboardDimension[] = [];

  for (const dimReg of registry) {
    const mappings: DashboardDimensionMapping[] = [];

    for (const source of sources) {
      const manual = !options?.forceRebuild
        ? getManualMappings(saved, dimReg.id, source.id)
        : null;

      if (manual?.physicalColumn) {
        mappings.push({ ...manual });
        continue;
      }

      const detected = detectBestColumn(source, dimReg);
      if (!detected) {
        warnings.unmappedSources.push({
          dimensionId: dimReg.id,
          sourceId: source.id,
          sourceAlias: source.alias,
        });
        continue;
      }

      if (detected.confidence < 0.6) {
        warnings.lowConfidence.push({
          dimensionId: dimReg.id,
          sourceId: source.id,
          physicalColumn: detected.column,
          confidence: detected.confidence,
        });
      }

      mappings.push({
        sourceId: source.id,
        physicalColumn: detected.column,
        origin: "auto",
        confidence: detected.confidence,
      });
    }

    if (mappings.length > 0) {
      dimensions.push({
        id: dimReg.id,
        label: dimReg.label,
        type: dimReg.type,
        mappings,
      });
    }
  }

  const dataset: DashboardDataset = {
    version: 1,
    dimensions,
    synonymOverrides: saved?.synonymOverrides ?? options?.synonymOverrides,
    updatedAt: new Date().toISOString(),
  };

  return {
    dataset,
    datasetDimensions: toLegacyDatasetDimensions(dataset),
    warnings,
  };
}

export function getPhysicalColumnForDimension(
  dataset: DashboardDataset | undefined,
  dimensionId: string,
  sourceId: string
): string | null {
  if (!dataset) return null;
  const dim = dataset.dimensions.find((d) => d.id === dimensionId);
  const m = dim?.mappings.find((x) => x.sourceId === sourceId);
  return m?.physicalColumn ?? null;
}

export function widgetSupportsDimension(
  sourceId: string,
  semanticField: string,
  dataset: DashboardDataset | undefined
): boolean {
  if (!dataset) return false;
  const dim = dataset.dimensions.find((d) => d.id === semanticField);
  if (!dim) return false;
  return dim.mappings.some((m) => m.sourceId === sourceId && !!m.physicalColumn);
}

/** Hash estable de columnas por fuente (detectar cambios de esquema). */
export function fieldsFingerprint(fields: DashboardSourceFields): string {
  return [...fields.all].sort().join("|");
}

export function parseLayoutDashboardDataset(layout: unknown): DashboardDataset | null {
  if (!layout || typeof layout !== "object") return null;
  const l = layout as {
    dashboardDataset?: DashboardDataset;
    datasetDimensions?: Record<string, Record<string, string>>;
  };
  if (l.dashboardDataset?.version === 1 && Array.isArray(l.dashboardDataset.dimensions)) {
    return l.dashboardDataset;
  }
  return null;
}

export function applyManualDimensionMapping(
  dataset: DashboardDataset,
  dimensionId: string,
  sourceId: string,
  physicalColumn: string
): DashboardDataset {
  const dimensions = dataset.dimensions.map((dim) => {
    if (dim.id !== dimensionId) return dim;
    const existing = dim.mappings.filter((m) => m.sourceId !== sourceId);
    return {
      ...dim,
      mappings: [
        ...existing,
        {
          sourceId,
          physicalColumn,
          origin: "manual" as const,
          confidence: 1,
        },
      ],
    };
  });

  const hasDim = dimensions.some((d) => d.id === dimensionId);
  if (!hasDim) {
    const reg = DEFAULT_DIMENSION_SYNONYMS.find((d) => d.id === dimensionId);
    dimensions.push({
      id: dimensionId,
      label: reg?.label ?? dimensionId,
      type: reg?.type ?? "string",
      mappings: [
        {
          sourceId,
          physicalColumn,
          origin: "manual",
          confidence: 1,
        },
      ],
    });
  }

  return {
    ...dataset,
    dimensions,
    updatedAt: new Date().toISOString(),
  };
}
