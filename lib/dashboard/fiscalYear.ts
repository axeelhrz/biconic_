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

/** Trimestre fiscal (1-4) según mes de inicio. */
export function fiscalQuarterIndex(month1: number, startMonth: number): number {
  return Math.ceil(fiscalMonthIndex(month1, startMonth) / 3);
}

/** Semestre fiscal (1-2) según mes de inicio. */
export function fiscalSemesterIndex(month1: number, startMonth: number): number {
  return fiscalMonthIndex(month1, startMonth) <= 6 ? 1 : 2;
}

/**
 * Expresión SQL (PostgreSQL) para particionar YTD / agrupar por año fiscal.
 * `dateExpr` debe ser una expresión de fecha válida (p. ej. `"fecha"::date`).
 */
export function sqlFiscalYearPartitionExpr(dateExpr: string, startMonth: number): string {
  const sm = normalizeFiscalYearStartMonth(startMonth);
  if (sm <= 1) return `EXTRACT(YEAR FROM ${dateExpr})`;
  return `(CASE WHEN EXTRACT(MONTH FROM ${dateExpr})::int >= ${sm} THEN EXTRACT(YEAR FROM ${dateExpr})::int ELSE EXTRACT(YEAR FROM ${dateExpr})::int - 1 END)`;
}

/** Índice de mes fiscal 1–12 en SQL. */
export function sqlFiscalMonthIndexExpr(dateExpr: string, startMonth: number): string {
  const sm = normalizeFiscalYearStartMonth(startMonth);
  if (sm <= 1) return `EXTRACT(MONTH FROM ${dateExpr})::int`;
  return `(CASE WHEN EXTRACT(MONTH FROM ${dateExpr})::int >= ${sm} THEN EXTRACT(MONTH FROM ${dateExpr})::int - ${sm} + 1 ELSE EXTRACT(MONTH FROM ${dateExpr})::int + ${12 - sm + 1} END)`;
}

/** Trimestre fiscal 1–4 en SQL. */
export function sqlFiscalQuarterIndexExpr(dateExpr: string, startMonth: number): string {
  return `CEIL(${sqlFiscalMonthIndexExpr(dateExpr, startMonth)} / 3.0)::int`;
}

/** Semestre fiscal 1–2 en SQL. */
export function sqlFiscalSemesterIndexExpr(dateExpr: string, startMonth: number): string {
  return `(CASE WHEN ${sqlFiscalMonthIndexExpr(dateExpr, startMonth)} <= 6 THEN 1 ELSE 2 END)`;
}

export type FiscalDateGroupExprs = {
  /** Clave de GROUP BY / ORDER BY. */
  groupExpr: string;
  /** Texto visible en el resultado. */
  displayExpr: string;
};

/**
 * Expresiones SQL de agrupación temporal respetando el inicio de año fiscal
 * para year / quarter / semester. day / week / month siguen el calendario.
 */
export function sqlFiscalAwareDateGroupExprs(
  dateExpr: string,
  granularity: string,
  startMonth: number
): FiscalDateGroupExprs | null {
  const gran = String(granularity ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const sm = normalizeFiscalYearStartMonth(startMonth);
  const ts = `${dateExpr}::timestamp`;

  if (gran === "year") {
    if (sm <= 1) {
      const trunc = `DATE_TRUNC('year', ${ts})`;
      return { groupExpr: trunc, displayExpr: `TO_CHAR(${trunc}, 'YYYY')` };
    }
    const fy = sqlFiscalYearPartitionExpr(ts, sm);
    return { groupExpr: fy, displayExpr: `(${fy})::text` };
  }

  if (gran === "quarter") {
    if (sm <= 1) {
      const trunc = `DATE_TRUNC('quarter', ${ts})`;
      return {
        groupExpr: trunc,
        displayExpr: `('T' || EXTRACT(QUARTER FROM ${trunc})::text || '/' || EXTRACT(YEAR FROM ${trunc})::text)`,
      };
    }
    const fy = sqlFiscalYearPartitionExpr(ts, sm);
    const fq = sqlFiscalQuarterIndexExpr(ts, sm);
    return {
      groupExpr: `((${fy})::text || '-Q' || (${fq})::text)`,
      displayExpr: `('T' || (${fq})::text || '/' || (${fy})::text)`,
    };
  }

  if (gran === "semester") {
    if (sm <= 1) {
      return {
        groupExpr: `(EXTRACT(YEAR FROM ${ts})::text || '-S' || CASE WHEN EXTRACT(MONTH FROM ${ts}) <= 6 THEN '1' ELSE '2' END)`,
        displayExpr: `(CASE WHEN EXTRACT(MONTH FROM ${ts}) <= 6 THEN 'S1/' ELSE 'S2/' END || EXTRACT(YEAR FROM ${ts})::text)`,
      };
    }
    const fy = sqlFiscalYearPartitionExpr(ts, sm);
    const fs = sqlFiscalSemesterIndexExpr(ts, sm);
    return {
      groupExpr: `((${fy})::text || '-S' || (${fs})::text)`,
      displayExpr: `('S' || (${fs})::text || '/' || (${fy})::text)`,
    };
  }

  return null;
}
