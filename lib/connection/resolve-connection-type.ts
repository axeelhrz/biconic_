import type { ConnectionType } from "@/lib/connection/connection-persistence";

function normalizeConnectionType(raw: string): ConnectionType | undefined {
  const t = raw.toLowerCase();
  if (!t) return undefined;
  if (t === "postgresql") return "postgres";
  if (t === "excel_file") return "excel";
  if (t === "mysql" || t === "postgres" || t === "firebird" || t === "excel") {
    return t;
  }
  return undefined;
}

/** Normaliza el tipo guardado en `connections.type` para las APIs de conexión. */
export function resolveConnectionType(
  connType: unknown,
  current?: ConnectionType | string
): ConnectionType | undefined {
  const fromCurrent = current ? normalizeConnectionType(String(current)) : undefined;
  if (fromCurrent) return fromCurrent;
  return normalizeConnectionType(String(connType ?? ""));
}

export type { ConnectionType };
