/**
 * Techo máximo de filas para ETL y conexiones.
 * Donde la sintaxis exige un número (p. ej. Firebird FIRST n, LIMIT en SQL),
 * se usa este valor para soportar bases de datos muy grandes.
 * Riesgos: memoria y tiempo en tablas enormes; monitorear en producción.
 */
export const ETL_MAX_ROWS_CEILING = 50_000_000;
