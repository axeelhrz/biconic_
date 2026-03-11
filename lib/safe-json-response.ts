/**
 * Parsea de forma segura el cuerpo de una Response como JSON.
 * Si el cuerpo no es JSON válido (p. ej. mensaje de error en texto plano),
 * devuelve un objeto con ok: false y error con el texto recibido, evitando
 * SyntaxError por JSON.parse.
 */
export async function safeJsonResponse<T = Record<string, unknown>>(
  response: Response
): Promise<T & { ok?: boolean; error?: string }> {
  const text = await response.text();
  if (!text?.trim()) {
    return { ok: false, error: "Respuesta vacía" } as T & { ok: false; error: string };
  }
  try {
    return JSON.parse(text) as T & { ok?: boolean; error?: string };
  } catch {
    const preview = text.slice(0, 300).replace(/\s+/g, " ").trim();
    return {
      ok: false,
      error: preview || `Error del servidor (${response.status})`,
    } as T & { ok: false; error: string };
  }
}
