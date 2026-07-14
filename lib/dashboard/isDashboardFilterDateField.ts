/**
 * Detecta si un filtro global del dashboard debe usar operadores temporales
 * (YEAR / MONTH / DAY / …) en lugar de comparación genérica.
 */

/** Alineado con DATE_DIMENSION_NAME_RE de derive-column-types (más permisivo para joins). */
const DATE_FIELD_NAME_RE =
  /(?:^|_|-)(fecha|fechacomprobante|fechaventa|fechaemision|fechahora|date|datetime|timestamp|periodo|period|anio|año|year|mes|month|dia|day)(?:_|-|$)|fecha|date/i;

export const DASHBOARD_DATE_FILTER_OPS = [
  "YEAR",
  "MONTH",
  "DAY",
  "YEAR_MONTH",
  "SEMESTER",
  "QUARTER",
] as const;

export type DashboardDateFilterOp = (typeof DASHBOARD_DATE_FILTER_OPS)[number];

export function isDashboardDateFilterOperator(operator: string | undefined | null): boolean {
  const op = String(operator ?? "").trim().toUpperCase();
  return (DASHBOARD_DATE_FILTER_OPS as readonly string[]).includes(op);
}

function fieldInDateList(field: string, dateFields: string[] | undefined | null): boolean {
  const key = String(field ?? "").trim().toLowerCase();
  if (!key) return false;
  return (dateFields ?? []).some((d) => String(d ?? "").trim().toLowerCase() === key);
}

/** Heurística por nombre de columna (joins, Excel tipado débil, etc.). */
export function looksLikeDateFieldName(field: string | undefined | null): boolean {
  const name = String(field ?? "").trim();
  if (!name) return false;
  if (name.toLowerCase() === "date") return true;
  return DATE_FIELD_NAME_RE.test(name);
}

export type DashboardFilterDateFieldContext = {
  /** `etlData.fields.date` */
  etlDateFields?: string[] | null;
  /** Por dataSource: `dataSources[].fields.date` */
  dataSourceDateFields?: Array<string[] | undefined | null> | null;
  /** Si el usuario eligió tipo de input Fecha en el editor. */
  inputType?: string | null;
};

/**
 * true si el filtro debe mostrar «Nivel temporal» y usar YEAR/MONTH/….
 * Criterio: metadata date, heurística de nombre, o inputType === "date".
 */
export function isDashboardFilterDateField(
  field: string | undefined | null,
  ctx?: DashboardFilterDateFieldContext
): boolean {
  if (String(ctx?.inputType ?? "").trim().toLowerCase() === "date") return true;

  const f = String(field ?? "").trim();
  if (!f) return false;
  if (f.toLowerCase() === "date") return true;

  if (fieldInDateList(f, ctx?.etlDateFields)) return true;
  for (const list of ctx?.dataSourceDateFields ?? []) {
    if (fieldInDateList(f, list)) return true;
  }

  return looksLikeDateFieldName(f);
}

/** Operador a persistir: fuerza YEAR si es fecha y el actual no es temporal. */
export function resolveDashboardFilterOperator(options: {
  field: string | undefined | null;
  operator: string | undefined | null;
  inputType?: string | null;
  etlDateFields?: string[] | null;
  dataSourceDateFields?: Array<string[] | undefined | null> | null;
}): string {
  const isDate = isDashboardFilterDateField(options.field, {
    etlDateFields: options.etlDateFields,
    dataSourceDateFields: options.dataSourceDateFields,
    inputType: options.inputType,
  });
  if (!isDate) return options.operator ?? "=";
  if (isDashboardDateFilterOperator(options.operator)) {
    return String(options.operator).trim().toUpperCase();
  }
  return "YEAR";
}
