/**
 * Techo máximo de filas para ETL y conexiones.
 * Donde la sintaxis exige un número (p. ej. Firebird FIRST n, LIMIT en SQL),
 * se usa este valor. Fijado al máximo entero 32-bit para no imponer límite práctico
 * de registros; el pipeline procesa por lotes hasta agotar la fuente.
 * Riesgos: memoria y tiempo en tablas enormes; monitorear en producción.
 */
export const ETL_MAX_ROWS_CEILING = 2_147_483_647;
