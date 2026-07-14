/** Mes de inicio del año fiscal (1 = enero, año calendario). */
export const DEFAULT_FISCAL_YEAR_START_MONTH = 1;

export const FISCAL_YEAR_MONTH_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

export function normalizeFiscalYearStartMonth(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_FISCAL_YEAR_START_MONTH;
  const m = Math.trunc(n);
  if (m < 1 || m > 12) return DEFAULT_FISCAL_YEAR_START_MONTH;
  return m;
}

/** Año fiscal al que pertenece una fecha (año calendario + mes 1-12). */
export function fiscalYearFromParts(calendarYear: number, month1: number, startMonth: number): number {
  const sm = normalizeFiscalYearStartMonth(startMonth);
  if (sm <= 1) return calendarYear;
  return month1 >= sm ? calendarYear : calendarYear - 1;
}

/** Posición del mes dentro del año fiscal (1-12). */
export function fiscalMonthIndex(month1: number, startMonth: number): number {
  const sm = normalizeFiscalYearStartMonth(startMonth);
  if (sm <= 1) return month1;
  return month1 >= sm ? month1 - sm + 1 : month1 + 12 - sm + 1;
}

/**
 * Expresión SQL (PostgreSQL) para particionar YTD por año fiscal.
 * `dateExpr` debe ser una expresión de fecha válida (p. ej. `"fecha"::date`).
 */
export function sqlFiscalYearPartitionExpr(dateExpr: string, startMonth: number): string {
  const sm = normalizeFiscalYearStartMonth(startMonth);
  if (sm <= 1) return `EXTRACT(YEAR FROM ${dateExpr})`;
  return `(CASE WHEN EXTRACT(MONTH FROM ${dateExpr})::int >= ${sm} THEN EXTRACT(YEAR FROM ${dateExpr})::int ELSE EXTRACT(YEAR FROM ${dateExpr})::int - 1 END)`;
}
