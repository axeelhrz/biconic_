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

/** Vista previa instantánea con JOIN: pocas filas, una sola consulta. */
export const ETL_PREVIEW_JOIN_INSTANT_LIMIT = 50;

/** Vista previa sin JOIN (tabla simple): equilibrio velocidad / muestra. */
export const ETL_PREVIEW_TABLE_LIMIT = 500;

/**
 * Techo máximo de filas en vista previa cuando el usuario marca "Sin límite de filas".
 * Evita FUNCTION_INVOCATION_TIMEOUT en serverless; el ETL de ejecución real puede usar ETL_MAX_ROWS_CEILING.
 */
export const ETL_PREVIEW_MAX_WHEN_UNLIMITED = 50_000;

/**
 * Máximo de filas por tabla al materializar Firebird/Postgres solo para vista previa.
 * El ETL real (fromEtlRun) no aplica este tope y copia la tabla completa.
 */
export const ETL_PREVIEW_MATERIALIZE_MAX_ROWS_PER_TABLE = 3_000;

/** Tope más bajo para vista previa instantánea (previewFast). */
export const ETL_PREVIEW_MATERIALIZE_FAST_MAX_ROWS_PER_TABLE = 1_500;

/**
 * Tamaño máximo de lote (techo) al paginar join-query desde el ETL run.
 * Con 3+ JOINs el run usa lotes pequeños por petición para no superar el timeout de la ruta (~295s); subir ETL_JOIN_CHUNK_SIZE solo sube el techo en 1–2 JOINs.
 */
export const ETL_JOIN_CHUNK_SIZE_DEFAULT = 100_000;

/**
 * Tope de valores distintos en «Excluir filas» (API /connection/distinct-values).
 * Evita FUNCTION_INVOCATION_TIMEOUT en columnas de alta cardinalidad.
 * Override opcional: ETL_DISTINCT_VALUES_MAX.
 */
export const ETL_DISTINCT_VALUES_MAX_DEFAULT = 10_000;

export function getDistinctValuesCap(): number {
  const fromEnv = Number(process.env.ETL_DISTINCT_VALUES_MAX);
  if (fromEnv > 0) return Math.floor(fromEnv);
  return ETL_DISTINCT_VALUES_MAX_DEFAULT;
}

/**
 * Muestra para análisis en Transformación (duplicados) y vista previa ampliada.
 * Mismo tope que valores distintos para evitar timeouts serverless.
 */
export const ETL_TRANSFORM_SAMPLE_LIMIT = ETL_DISTINCT_VALUES_MAX_DEFAULT;

/**
 * Variables de entorno para join-query (API connection):
 * - ETL_JOIN_TIMEOUT_MS: timeout en ms para la ruta join-query; pasado este tiempo se devuelve 504. Default 295000 (~5 min; Vercel Pro techo 300s).
 * - ETL_JOIN_SOURCE_LIMIT_MAX: tope opcional de filas por tabla en JOIN in-memory (Firebird/cross-connection). Se aplica además del cap por número de joins.
 * - ETL_JOIN_KEYSET_BATCH: tamaño de lote al filtrar secundarias por claves (default 1500). En Firebird nunca supera FIREBIRD_IN_LIST_MAX.
 */

/**
 * Límite duro de Firebird: no más de 1500 valores en un member list (`IN (...)`).
 * Error típico: SQLCODE -901 "Too many values (more than 1500) in member list".
 */
export const FIREBIRD_IN_LIST_MAX = 1500;

/** Lotes OR-AND para clave compuesta en Firebird (más seguro que IN multi-columna). */
export const FIREBIRD_COMPOSITE_KEYSET_BATCH = 100;

/** Tamaño de lote keyset para filtrar tablas secundarias (nunca > FIREBIRD_IN_LIST_MAX en Firebird). */
export function getJoinKeysetBatchSize(dbType?: string | null): number {
  const fromEnv = Number(process.env.ETL_JOIN_KEYSET_BATCH);
  const requested = fromEnv > 0 ? Math.floor(fromEnv) : FIREBIRD_IN_LIST_MAX;
  const capped = Math.max(100, Math.min(FIREBIRD_IN_LIST_MAX, requested));
  const t = String(dbType ?? "").toLowerCase();
  if (t === "firebird" || t === "fb" || t === "") {
    return Math.min(capped, FIREBIRD_IN_LIST_MAX);
  }
  // Postgres / otros: permitir un poco más si se configura, pero default 1500.
  return Math.max(100, Math.min(5000, fromEnv > 0 ? Math.floor(fromEnv) : FIREBIRD_IN_LIST_MAX));
}
