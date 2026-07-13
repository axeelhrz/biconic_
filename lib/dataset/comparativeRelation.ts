import { inferFormatForColumn, type InferredColumnFormat } from "@/lib/derive-column-types";
import type { DateGranularity } from "@/lib/dashboard/dateFormatting";

export type DateTransform = "none" | "day" | "week" | "month" | "quarter" | "year";
export type ComparativeValueType = "absolute" | "percent";

export type ComparativeFieldMapping = {
  id: string;
  comparativeColumn: string;
  baseColumn: string;
  baseDateTransform?: DateTransform;
};

export type ComparativeMeasureField = {
  column: string;
  valueType: ComparativeValueType;
  label?: string;
};

export type ComparativeRelationValidation = {
  status: "ok" | "blocked" | "warning";
  duplicates?: { count: number; sampleKeys?: string[] };
  emptyKeyColumns?: { columns: string[]; message?: string };
  baseWithoutMatch?: { count: number };
  comparativeWithoutBase?: { count: number };
  validatedAt: string;
};

export type ComparativeRelation = {
  id: string;
  name: string;
  comparativeDatasetId: string;
  comparativeDatasetName?: string;
  fieldMappings: ComparativeFieldMapping[];
  comparisonLevel: string[];
  comparativeFields: ComparativeMeasureField[];
  validation?: ComparativeRelationValidation;
};

const DATE_TRANSFORMS: DateTransform[] = ["none", "day", "week", "month", "quarter", "year"];

const GRANULARITY_RANK: Record<DateTransform | DateGranularity, number> = {
  none: 0,
  day: 1,
  week: 2,
  month: 3,
  quarter: 4,
  semester: 4,
  year: 5,
};

export function isDateTransform(v: unknown): v is DateTransform {
  return typeof v === "string" && DATE_TRANSFORMS.includes(v as DateTransform);
}

export function deriveComparisonLevel(mappings: ComparativeFieldMapping[]): string[] {
  return mappings.map((m) => m.baseColumn.trim()).filter(Boolean);
}

export function detectComparativeValueType(
  columnName: string,
  sampleValues?: unknown[]
): ComparativeValueType {
  const format = inferFormatForColumn(columnName, "Número", sampleValues ?? []);
  if (format === "percent") return "percent";
  return "absolute";
}

export function isComparativeMeasureCandidate(params: {
  columnName: string;
  role?: string;
  inferredType?: string;
  format?: InferredColumnFormat;
}): boolean {
  const { columnName, role, inferredType, format } = params;
  if (role === "measure") return true;
  if (inferredType === "Número" || inferredType === "number") {
    if (format === "percent" || format === "currency" || format === "number" || !format) return true;
  }
  const detected = inferFormatForColumn(columnName, "Número", []);
  return detected === "percent" || detected === "currency" || detected === "number";
}

export function granularityRank(value: DateTransform | DateGranularity | "none" | undefined): number {
  if (!value || value === "none") return 0;
  return GRANULARITY_RANK[value] ?? 0;
}

/** True si el análisis agrupa más fino que el nivel de comparación (debe bloquear). */
export function isAnalysisFinerThanComparisonLevel(params: {
  analysisDimensions: string[];
  analysisDateGranularity?: DateGranularity;
  comparisonLevel: string[];
  fieldMappings: ComparativeFieldMapping[];
  timeColumn?: string;
}): boolean {
  const { analysisDimensions, analysisDateGranularity, comparisonLevel, fieldMappings, timeColumn } = params;

  for (const mapping of fieldMappings) {
    const transform = mapping.baseDateTransform ?? "none";
    if (transform === "none") continue;

    const baseCol = mapping.baseColumn.trim();
    const isTimeDim =
      (timeColumn && baseCol === timeColumn) ||
      analysisDimensions.some((d) => d.trim() === baseCol);

    if (!isTimeDim) continue;

    if (analysisDateGranularity && granularityRank(analysisDateGranularity) < granularityRank(transform)) {
      return true;
    }
  }

  const compSet = new Set(comparisonLevel.map((c) => c.trim().toLowerCase()));
  for (const dim of analysisDimensions) {
    const d = dim.trim();
    if (!d) continue;
    const inLevel = compSet.has(d.toLowerCase());
    if (!inLevel && comparisonLevel.length > 0) {
      // Dimensión extra no presente en nivel de comparación: permitido si es desglose adicional
      // Solo bloqueamos granularidad temporal más fina (arriba).
    }
  }

  return false;
}

export function comparativeOutputColumns(
  metricAlias: string,
  valueType: ComparativeValueType
): string[] {
  const safe = metricAlias.trim() || "metric";
  if (valueType === "percent") {
    return [
      `${safe}_valor_real_porcentaje`,
      `${safe}_valor_comparativo_porcentaje`,
      `${safe}_diferencia_puntos_porcentuales`,
    ];
  }
  return [
    `${safe}_valor_real`,
    `${safe}_valor_comparativo`,
    `${safe}_delta`,
    `${safe}_delta_porcentaje`,
    `${safe}_cumplimiento`,
  ];
}

export function parseComparativeFieldMapping(raw: unknown): ComparativeFieldMapping | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const comparativeColumn = typeof o.comparativeColumn === "string" ? o.comparativeColumn.trim() : "";
  const baseColumn = typeof o.baseColumn === "string" ? o.baseColumn.trim() : "";
  if (!comparativeColumn || !baseColumn) return null;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `map-${Date.now()}`;
  const baseDateTransform = isDateTransform(o.baseDateTransform) ? o.baseDateTransform : undefined;
  return { id, comparativeColumn, baseColumn, ...(baseDateTransform ? { baseDateTransform } : {}) };
}

export function parseComparativeMeasureField(raw: unknown): ComparativeMeasureField | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const column = typeof o.column === "string" ? o.column.trim() : "";
  if (!column) return null;
  const valueType: ComparativeValueType = o.valueType === "percent" ? "percent" : "absolute";
  const label = typeof o.label === "string" ? o.label.trim() : undefined;
  return { column, valueType, ...(label ? { label } : {}) };
}

export function parseComparativeRelation(raw: unknown): ComparativeRelation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const comparativeDatasetId =
    typeof o.comparativeDatasetId === "string" ? o.comparativeDatasetId.trim() : "";
  if (!id || !name || !comparativeDatasetId) return null;

  const fieldMappings = Array.isArray(o.fieldMappings)
    ? o.fieldMappings.map(parseComparativeFieldMapping).filter((m): m is ComparativeFieldMapping => m != null)
    : [];
  const comparativeFields = Array.isArray(o.comparativeFields)
    ? o.comparativeFields.map(parseComparativeMeasureField).filter((f): f is ComparativeMeasureField => f != null)
    : [];

  const comparisonLevel = Array.isArray(o.comparisonLevel)
    ? (o.comparisonLevel as unknown[]).filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : deriveComparisonLevel(fieldMappings);

  const comparativeDatasetName =
    typeof o.comparativeDatasetName === "string" ? o.comparativeDatasetName.trim() : undefined;

  let validation: ComparativeRelationValidation | undefined;
  if (o.validation && typeof o.validation === "object") {
    const v = o.validation as Record<string, unknown>;
    const status = v.status === "blocked" || v.status === "warning" || v.status === "ok" ? v.status : "ok";
    validation = {
      status,
      validatedAt: typeof v.validatedAt === "string" ? v.validatedAt : new Date().toISOString(),
      ...(v.duplicates && typeof v.duplicates === "object"
        ? {
            duplicates: {
              count: Number((v.duplicates as { count?: number }).count ?? 0),
              sampleKeys: Array.isArray((v.duplicates as { sampleKeys?: unknown }).sampleKeys)
                ? ((v.duplicates as { sampleKeys: unknown[] }).sampleKeys.filter(
                    (k): k is string => typeof k === "string"
                  ) as string[])
                : undefined,
            },
          }
        : {}),
      ...(v.baseWithoutMatch && typeof v.baseWithoutMatch === "object"
        ? { baseWithoutMatch: { count: Number((v.baseWithoutMatch as { count?: number }).count ?? 0) } }
        : {}),
      ...(v.comparativeWithoutBase && typeof v.comparativeWithoutBase === "object"
        ? {
            comparativeWithoutBase: {
              count: Number((v.comparativeWithoutBase as { count?: number }).count ?? 0),
            },
          }
        : {}),
    };
  }

  return {
    id,
    name,
    comparativeDatasetId,
    ...(comparativeDatasetName ? { comparativeDatasetName } : {}),
    fieldMappings,
    comparisonLevel,
    comparativeFields,
    ...(validation ? { validation } : {}),
  };
}

export function parseComparativeRelationsFromConfig(
  config: unknown
): ComparativeRelation[] {
  if (!config || typeof config !== "object") return [];
  const raw = (config as Record<string, unknown>).comparativeRelations;
  if (!Array.isArray(raw)) return [];
  return raw.map(parseComparativeRelation).filter((r): r is ComparativeRelation => r != null);
}

export function findComparativeRelation(
  config: unknown,
  relationId: string
): ComparativeRelation | null {
  const relations = parseComparativeRelationsFromConfig(config);
  return relations.find((r) => r.id === relationId) ?? null;
}

export function sqlDateTruncExpr(columnSql: string, transform: DateTransform): string {
  if (transform === "none") return columnSql;
  if (transform === "quarter") {
    return `DATE_TRUNC('quarter', ${columnSql}::timestamp)`;
  }
  return `DATE_TRUNC('${transform}', ${columnSql}::timestamp)`;
}

export function quoteSqlIdentifier(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * Oculta columnas legacy `primary_*` cuando existe la columna real sin prefijo
 * (artefacto de ETLs sin JOIN que duplicaban el esquema).
 */
export function filterComparativeRelationFields(fields: string[]): string[] {
  const set = new Set(fields);
  return fields.filter((col) => {
    if (!col.startsWith("primary_")) return true;
    const twin = col.slice("primary_".length);
    return !set.has(twin);
  });
}

/** Corrige referencias a columnas `primary_*` vacías si existe la columna real. */
export function normalizeComparativeColumnRef(
  column: string,
  availableFields: string[]
): string {
  const trimmed = column.trim();
  if (!trimmed.startsWith("primary_")) return trimmed;
  const twin = trimmed.slice("primary_".length);
  const set = new Set(availableFields);
  return set.has(twin) ? twin : trimmed;
}

export function normalizeComparativeFieldMappings(
  mappings: ComparativeFieldMapping[],
  availableFields: string[]
): ComparativeFieldMapping[] {
  return mappings.map((m) => ({
    ...m,
    comparativeColumn: normalizeComparativeColumnRef(m.comparativeColumn, availableFields),
  }));
}
