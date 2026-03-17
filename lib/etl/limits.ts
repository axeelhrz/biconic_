/**
 * Techo máximo de filas para ETL y conexiones.
 * Donde la sintaxis exige un número (p. ej. Firebird FIRST n, LIMIT en SQL),
 * se usa este valor. Fijado al máximo entero 32-bit para no imponer límite práctico
 * de registros; el pipeline procesa por lotes hasta agotar la fuente.
 * Riesgos: memoria y tiempo en tablas enormes; monitorear en producción.
 */
export const ETL_MAX_ROWS_CEILING = 2_147_483_647;

/** Límite por defecto para vista previa de datos en UI (run-preview). Evita timeouts en tablas grandes. */
export const ETL_PREVIEW_DEFAULT_LIMIT = 1000;

/**
 * Techo máximo de filas en vista previa cuando el usuario marca "Sin límite de filas".
 * Evita FUNCTION_INVOCATION_TIMEOUT en serverless; el ETL de ejecución real puede usar ETL_MAX_ROWS_CEILING.
 */
export const ETL_PREVIEW_MAX_WHEN_UNLIMITED = 50_000;

/**
 * Tamaño de cada lote al paginar llamadas a join-query desde el ETL run.
 * Reducir este valor (p. ej. vía ETL_JOIN_CHUNK_SIZE) si alguna petición sigue haciendo timeout.
 */
export const ETL_JOIN_CHUNK_SIZE_DEFAULT = 50_000;
