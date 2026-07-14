/** Parseo robusto de columnas texto/date/timestamp. Barras: DD/MM o MM/DD según `slashOrder`. */
export function safeDateCast(expr: string, slashOrder: "DMY" | "MDY" = "DMY"): string {
  const e = expr.trim();
  const slashFmt = slashOrder === "MDY" ? "MM/DD/YYYY" : "DD/MM/YYYY";
  return `(
    CASE
      WHEN ${e} IS NULL THEN NULL
      WHEN trim((${e})::text) ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(trim((${e})::text), '${slashFmt}')
      WHEN trim((${e})::text) ~ '^\\d{1,2}-\\d{1,2}-\\d{4}$' THEN to_date(trim((${e})::text), 'DD-MM-YYYY')
      WHEN trim((${e})::text) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN to_date(trim((${e})::text), 'YYYY-MM-DD')
      WHEN trim((${e})::text) ~ '^\\d{4}-\\d{2}-\\d{2}[ T].*$' THEN (trim((${e})::text))::timestamp::date
      WHEN (${e})::text LIKE '%, % de % de %' THEN to_date((${e})::text, 'Day, DD "de" Month "de" YYYY')
      ELSE NULL
    END
  )`;
}
