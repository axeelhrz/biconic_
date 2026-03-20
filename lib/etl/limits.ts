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
 * Tamaño máximo de lote (techo) al paginar join-query desde el ETL run.
 * Con 3+ JOINs el run usa lotes pequeños por petición para no superar el timeout de la ruta (~295s); subir ETL_JOIN_CHUNK_SIZE solo sube el techo en 1–2 JOINs.
 */
export const ETL_JOIN_CHUNK_SIZE_DEFAULT = 100_000;

/**
 * Variables de entorno para join-query (API connection):
 * - ETL_JOIN_TIMEOUT_MS: timeout en ms para la ruta join-query; pasado este tiempo se devuelve 504. Default 295000 (~5 min; Vercel Pro techo 300s).
 * - ETL_JOIN_SOURCE_LIMIT_MAX: tope opcional de filas por tabla en JOIN in-memory (Firebird/cross-connection). Se aplica además del cap por número de joins.
 * - ETL_JOIN_KEYSET_BATCH: tamaño de lote al filtrar secundarias por claves (default 1500, máx 2500 en join-query).
 */
