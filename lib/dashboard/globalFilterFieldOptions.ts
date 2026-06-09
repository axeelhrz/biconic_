import type { ETLDataResponse } from "@/hooks/admin/useAdminDashboardEtlData";

export type DerivedColumnRef = {
  name: string;
  expression: string;
  defaultAggregation?: string;
};

export type GlobalFilterFieldOption = {
  value: string;
  label: string;
};

const SEMANTIC_LABELS: Record<string, string> = { date: "Fecha", region: "Región" };

function metricNamesToExclude(savedMetrics: Array<{ name?: string | null }> | undefined): Set<string> {
  const out = new Set<string>();
  for (const m of savedMetrics ?? []) {
    const name = String(m?.name ?? "").trim().toLowerCase();
    if (name) out.add(name);
  }
  return out;
}

function hasSemanticDimensions(etlData: ETLDataResponse | null | undefined): boolean {
  const datasetDimensions = etlData?.datasetDimensions;
  return (
    !!datasetDimensions &&
    Object.keys(datasetDimensions).length > 0 &&
    !!etlData?.dataSources &&
    etlData.dataSources.length > 1
  );
}

/**
 * Opciones de campo para filtros globales del dashboard:
 * columnas físicas + columnas derivadas manuales, excluyendo nombres de métricas guardadas.
 */
export function buildGlobalFilterFieldOptions(options: {
  etlData: ETLDataResponse | null | undefined;
  derivedColumns?: DerivedColumnRef[];
  savedMetrics?: Array<{ name?: string | null }>;
  excludeFields?: string[];
}): GlobalFilterFieldOption[] {
  const { etlData, derivedColumns, savedMetrics, excludeFields } = options;
  if (!etlData) return [];

  const excluded = new Set(
    (excludeFields ?? []).map((f) => String(f ?? "").trim().toLowerCase()).filter(Boolean)
  );
  const metricNames = metricNamesToExclude(savedMetrics);

  if (hasSemanticDimensions(etlData) && etlData.datasetDimensions) {
    return Object.keys(etlData.datasetDimensions)
      .filter((key) => !excluded.has(key.toLowerCase()))
      .map((key) => ({
        value: key,
        label: SEMANTIC_LABELS[key] || key,
      }));
  }

  const derivedByLower = new Map(
    (derivedColumns ?? [])
      .filter((d) => d?.name && String(d.name).trim())
      .map((d) => [String(d.name).trim().toLowerCase(), String(d.name).trim()])
  );

  const seen = new Set<string>();
  const result: GlobalFilterFieldOption[] = [];

  const pushField = (rawName: string, isDerived: boolean) => {
    const name = String(rawName ?? "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key) || excluded.has(key) || metricNames.has(key)) return;
    seen.add(key);
    result.push({
      value: name,
      label: isDerived ? `${name} (calculada)` : name,
    });
  };

  for (const field of etlData.fields?.all ?? []) {
    pushField(field, derivedByLower.has(String(field).trim().toLowerCase()));
  }

  for (const [, name] of derivedByLower) {
    pushField(name, true);
  }

  return result.sort((a, b) => a.label.localeCompare(b.label, "es"));
}

export function globalFilterFieldLabel(
  field: string,
  etlData: ETLDataResponse | null | undefined,
  derivedColumns?: DerivedColumnRef[]
): string {
  if (hasSemanticDimensions(etlData) && etlData?.datasetDimensions?.[field]) {
    return SEMANTIC_LABELS[field] || field;
  }
  const isDerived = (derivedColumns ?? []).some(
    (d) => String(d.name).trim().toLowerCase() === String(field).trim().toLowerCase()
  );
  return isDerived ? `${field} (calculada)` : field;
}
