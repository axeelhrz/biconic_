/**
 * Literal SQL para filtros, criterios COUNTIF/SUMIF y condiciones de métricas.
 * Los números finitos se emiten como texto entre comillas simples para que Postgres
 * pueda compararlos con columnas `text` sin error «operator does not exist: text = integer».
 */
export function toSqlLiteral(v: unknown): string {
  if (v == null || typeof v === "undefined") return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return `'${String(v)}'`;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}
