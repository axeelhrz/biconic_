/** Cast a numérico que devuelve NULL si el valor no es un número válido (evita "invalid input syntax for type numeric"). */
export function safeNumericCast(expr: string): string {
  const e = expr.trim();
  const pattern = "'^[[:space:]]*[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?[[:space:]]*$'";
  return `(CASE WHEN (${e})::text ~ ${pattern} THEN ((${e})::text)::numeric ELSE NULL END)`;
}
