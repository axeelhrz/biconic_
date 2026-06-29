/** Normaliza el tipo guardado en `connections.type` para las APIs de conexión. */
export function resolveConnectionType(
  connType: unknown,
  current?: string
): string | undefined {
  if (current) return current;
  const t = String(connType ?? "").toLowerCase();
  if (!t) return undefined;
  if (t === "postgresql") return "postgres";
  if (t === "excel_file") return "excel";
  return t;
}
