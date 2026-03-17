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
 * Reducir (vía ETL_JOIN_CHUNK_SIZE) si hay timeout. Con múltiples JOINs el run usa un chunk menor (4+ → 5k, 3 → 10k, 2 → 20k).
 */
export const ETL_JOIN_CHUNK_SIZE_DEFAULT = 50_000;

/**
 * Variables de entorno para join-query (API connection):
 * - ETL_JOIN_TIMEOUT_MS: timeout en ms para la ruta join-query; pasado este tiempo se devuelve 504. Default 295000 (~5 min; Vercel Pro techo 300s).
 * - ETL_JOIN_SOURCE_LIMIT_MAX: tope opcional de filas por tabla en JOIN in-memory (Firebird/cross-connection). Se aplica además del cap por número de joins.
 * Límites por número de JOINs (in-memory): 2 → 600, 3 → 300, 4+ → 150 filas por tabla para evitar timeout.
 */
