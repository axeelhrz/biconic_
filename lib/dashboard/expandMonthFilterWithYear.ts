/**
 * Operadores de fecha cuyo valor multi debe seguir siendo el mismo `operator` (no sustituir por IN genérico).
 * Alineado con DashboardViewer / aggregate-data.
 */
export const DATE_OPERATORS_WITH_MULTI_VALUE_SQL = new Set([
  "YEAR",
  "MONTH",
  "QUARTER",
  "SEMESTER",
  "YEAR_MONTH",
]);

const YM_RE = /^(\d{4})-(\d{1,2})$/;

function normFieldKey(field: string): string {
  return String(field ?? "").trim().toLowerCase();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export type GlobalFilterLike = {
  id: string;
  field: string;
  operator?: string;
  value?: unknown;
  inputType?: string;
};

function resolveFilterValue(gf: GlobalFilterLike, filterValues: Record<string, unknown>): unknown {
  return filterValues[gf.id] !== undefined ? filterValues[gf.id] : gf.value;
}

function collectYearsFromValue(raw: unknown, inputType?: string): number[] {
  if (raw === "" || raw == null) return [];
  const list = Array.isArray(raw) ? raw : inputType === "multi" ? [raw] : [raw];
  const years: number[] = [];
  for (const x of list) {
    const n = Number(x);
    if (Number.isFinite(n) && n >= 1900 && n <= 2100) years.push(Math.round(n));
  }
  return [...new Set(years)];
}

/**
 * Si el filtro es MONTH con meses de calendario 1–12 (sin `YYYY-MM`) y existe un filtro YEAR
 * en el mismo `field`, devuelve lista `YYYY-MM` (producto años × meses). Así el WHERE no depende
 * de que el filtro YEAR siga presente si una columna se cae en validación de tabla.
 */
export function expandMonthFilterValueWithYear(
  globalFilters: readonly GlobalFilterLike[],
  filterValues: Record<string, unknown>,
  ctx: { field: string; operator?: string; value: unknown }
): unknown {
  if (String(ctx.operator ?? "").toUpperCase() !== "MONTH") return ctx.value;

  const rawVal = ctx.value;
  if (rawVal === "" || rawVal == null) return rawVal;
  const parts = Array.isArray(rawVal) ? rawVal : [rawVal];
  if (parts.length === 0) return rawVal;

  const monthNums: number[] = [];
  const ctxField = normFieldKey(ctx.field);
  for (const p of parts) {
    const s = String(p ?? "").trim();
    // Ya viene año-mes explícito (distinct YYYY-MM o fecha ISO) → no mezclar con expansión 1–12 + YEAR.
    if (YM_RE.test(s) || /^\d{4}-\d{1,2}(?:-\d{1,2})?(?:[Tt ].*)?$/.test(s)) {
      return rawVal;
    }
    const n = Number(p);
    if (Number.isFinite(n) && n >= 1 && n <= 12) monthNums.push(Math.round(n));
    else {
      return rawVal;
    }
  }
  if (monthNums.length === 0) return rawVal;
  const uniqueMonths = [...new Set(monthNums)];

  const yearFilter = globalFilters.find(
    (g) => normFieldKey(g.field) === ctxField && String(g.operator ?? "").toUpperCase() === "YEAR"
  );
  if (!yearFilter) return rawVal;

  const yRaw = resolveFilterValue(yearFilter, filterValues);
  const years = collectYearsFromValue(yRaw, yearFilter.inputType);
  if (years.length === 0) return rawVal;

  const out: string[] = [];
  for (const y of years) {
    for (const m of uniqueMonths) {
      out.push(`${y}-${pad2(m)}`);
    }
  }
  return out;
}

/**
 * Normaliza valor MONTH en servidor si solo hay meses 1–12 y existe YEAR en el mismo campo.
 */
export function expandMonthValueWithYearFromFilters(
  field: string,
  monthValue: unknown,
  allFilters: readonly { field: string; operator?: string; value: unknown }[]
): unknown {
  if (String(monthValue ?? "") === "") return monthValue;
  const parts = Array.isArray(monthValue) ? monthValue : [monthValue];
  if (parts.length === 0) return monthValue;

  const fk = normFieldKey(field);
  const monthNums: number[] = [];
  for (const p of parts) {
    const s = String(p ?? "").trim();
    if (YM_RE.test(s) || /^\d{4}-\d{1,2}(?:-\d{1,2})?(?:[Tt ].*)?$/.test(s)) return monthValue;
    const n = Number(p);
    if (Number.isFinite(n) && n >= 1 && n <= 12) monthNums.push(Math.round(n));
    else return monthValue;
  }
  if (monthNums.length === 0) return monthValue;
  const uniqueMonths = [...new Set(monthNums)];

  const yearFilter = allFilters.find(
    (g) => normFieldKey(g.field) === fk && String(g.operator ?? "").toUpperCase() === "YEAR"
  );
  if (!yearFilter || yearFilter.value === "" || yearFilter.value == null) return monthValue;

  const years = collectYearsFromValue(yearFilter.value, undefined);
  if (years.length === 0) return monthValue;

  const out: string[] = [];
  for (const y of years) {
    for (const m of uniqueMonths) {
      out.push(`${y}-${pad2(m)}`);
    }
  }
  return out;
}
