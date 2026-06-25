/** URL de Postgres interno (única fuente de verdad para conexiones de aplicación). */
export function getInternalDbUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgres://biconic:biconic_dev_password@localhost:6432/biconic"
  );
}

/** Schema donde process-excel materializa las tablas importadas. */
export const EXCEL_PHYSICAL_SCHEMA = "data_warehouse";
