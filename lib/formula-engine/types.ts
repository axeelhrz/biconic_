/** Columna calculada (nombre + expresión sobre columnas + agregación por defecto). */
export interface DerivedColumnRef {
  name: string;
  expression: string;
  defaultAggregation: string;
}

export type SqlDialect = "postgres" | "mysql";

/** Contexto de expansión: detección de ciclos en columnas derivadas y dialecto SQL. */
export interface ExpansionContext {
  visitedDerived: Set<string>;
  dialect: SqlDialect;
}
