import type { ParameterOrJSON } from "postgres";

export function toSqlParams(vals: unknown[]): ParameterOrJSON<never>[] {
  return vals as ParameterOrJSON<never>[];
}
