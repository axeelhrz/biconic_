export class SupersededFetchError extends Error {
  constructor() {
    super("superseded");
    this.name = "SupersededFetchError";
  }
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string; code?: string };
  if (e.name === "AbortError" || e.name === "TimeoutError") return true;
  if (e.code === "ABORT_ERR") return true;
  const msg = String(e.message ?? "").toLowerCase();
  return msg.includes("abort") || msg.includes("cancelled") || msg.includes("canceled");
}

export function isSupersededFetchError(err: unknown): err is SupersededFetchError {
  return err instanceof SupersededFetchError;
}

export function formatFetchErrorMessage(
  err: unknown,
  timeoutMessage = "La solicitud tardó demasiado"
): string {
  if (isSupersededFetchError(err)) return "";
  if (isAbortError(err)) return `${timeoutMessage}. Reintentá en unos segundos.`;
  return err instanceof Error ? err.message : "Error al cargar datos";
}
