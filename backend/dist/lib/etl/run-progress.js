"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ETL_RUN_PROGRESS_PREFIX = void 0;
exports.isEtlRunProgressMessage = isEtlRunProgressMessage;
exports.formatEtlRunProgressMessage = formatEtlRunProgressMessage;
exports.reportEtlRunProgress = reportEtlRunProgress;
exports.clearEtlRunProgressMessage = clearEtlRunProgressMessage;
exports.ETL_RUN_PROGRESS_PREFIX = "⏳ ";
function isEtlRunProgressMessage(msg) {
    return typeof msg === "string" && msg.startsWith(exports.ETL_RUN_PROGRESS_PREFIX);
}
function formatEtlRunProgressMessage(text) {
    return `${exports.ETL_RUN_PROGRESS_PREFIX}${text.trim()}`;
}
async function reportEtlRunProgress(supabaseAdmin, runId, options) {
    try {
        const payload = {
            status: "running",
            error_message: formatEtlRunProgressMessage(options.message),
        };
        if (typeof options.rowsProcessed === "number" && options.rowsProcessed >= 0) {
            payload.rows_processed = options.rowsProcessed;
        }
        await supabaseAdmin.from("etl_runs_log").update(payload).eq("id", runId);
    }
    catch {
    }
}
async function clearEtlRunProgressMessage(supabaseAdmin, runId) {
    try {
        const { data } = await supabaseAdmin
            .from("etl_runs_log")
            .select("error_message")
            .eq("id", runId)
            .maybeSingle();
        const msg = data?.error_message;
        if (!isEtlRunProgressMessage(msg))
            return;
        await supabaseAdmin
            .from("etl_runs_log")
            .update({ error_message: null })
            .eq("id", runId);
    }
    catch {
    }
}
//# sourceMappingURL=run-progress.js.map