/** Prefijo en error_message mientras el run está activo (no es un error real). */
export const ETL_RUN_PROGRESS_PREFIX = "⏳ ";

export function isEtlRunProgressMessage(msg: string | null | undefined): boolean {
  return typeof msg === "string" && msg.startsWith(ETL_RUN_PROGRESS_PREFIX);
}

export function formatEtlRunProgressMessage(text: string): string {
  return `${ETL_RUN_PROGRESS_PREFIX}${text.trim()}`;
}

/** Actualiza monitores con fase actual (JOIN/materialización) sin marcar el run como fallido. */
export async function reportEtlRunProgress(
  supabaseAdmin: { from: (t: string) => any },
  runId: string,
  options: { message: string; rowsProcessed?: number }
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      status: "running",
      error_message: formatEtlRunProgressMessage(options.message),
    };
    if (typeof options.rowsProcessed === "number" && options.rowsProcessed >= 0) {
      payload.rows_processed = options.rowsProcessed;
    }
    await supabaseAdmin.from("etl_runs_log").update(payload).eq("id", runId);
  } catch {
    /* no bloquear el pipeline */
  }
}

export async function clearEtlRunProgressMessage(
  supabaseAdmin: { from: (t: string) => any },
  runId: string
): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from("etl_runs_log")
      .select("error_message")
      .eq("id", runId)
      .maybeSingle();
    const msg = (data as { error_message?: string | null } | null)?.error_message;
    if (!isEtlRunProgressMessage(msg)) return;
    await supabaseAdmin
      .from("etl_runs_log")
      .update({ error_message: null })
      .eq("id", runId);
  } catch {
    /* ignore */
  }
}
