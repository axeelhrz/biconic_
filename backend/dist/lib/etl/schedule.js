"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVE_RUN_GUARD_MINUTES = exports.SCHEDULE_DISPLAY_TIMEZONE = exports.ETL_SCHEDULE_FREQUENCIES = void 0;
exports.getIntervalMs = getIntervalMs;
exports.isDue = isDue;
exports.computeNextRunAt = computeNextRunAt;
exports.formatScheduleLabel = formatScheduleLabel;
exports.formatScheduleDateTime = formatScheduleDateTime;
exports.formatNextExecutionDisplay = formatNextExecutionDisplay;
exports.parseScheduleFromLayout = parseScheduleFromLayout;
exports.getStaleRunMinutes = getStaleRunMinutes;
exports.getHardStaleRunMinutes = getHardStaleRunMinutes;
exports.mergeScheduleIntoGuidedConfig = mergeScheduleIntoGuidedConfig;
exports.updateEtlScheduleLastRunAt = updateEtlScheduleLastRunAt;
exports.ETL_SCHEDULE_FREQUENCIES = [
    { value: "15m", label: "15 minutos" },
    { value: "1h", label: "1 hora" },
    { value: "6h", label: "6 horas" },
    { value: "12h", label: "12 horas" },
    { value: "24h", label: "24 horas" },
    { value: "1w", label: "1 semana" },
    { value: "1M", label: "1 mes" },
];
const FREQUENCY_MS = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "12h": 12 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "1w": 7 * 24 * 60 * 60 * 1000,
    "1M": 30 * 24 * 60 * 60 * 1000,
};
function getIntervalMs(frequency) {
    const f = (frequency || "").trim();
    return FREQUENCY_MS[f] ?? null;
}
function isDue(lastRunAt, intervalMs) {
    if (!lastRunAt)
        return true;
    const last = new Date(lastRunAt).getTime();
    if (Number.isNaN(last))
        return true;
    return Date.now() - last >= intervalMs;
}
function computeNextRunAt(lastRunAt, frequency) {
    const f = (frequency || "").trim();
    if (!f)
        return null;
    const intervalMs = getIntervalMs(f);
    if (intervalMs == null)
        return null;
    const base = lastRunAt ? new Date(lastRunAt).getTime() : Date.now();
    if (Number.isNaN(base))
        return new Date(Date.now() + intervalMs);
    return new Date(base + intervalMs);
}
function formatScheduleLabel(frequency) {
    const f = (frequency || "").trim();
    if (!f)
        return "Manual";
    return exports.ETL_SCHEDULE_FREQUENCIES.find((x) => x.value === f)?.label ?? f;
}
exports.SCHEDULE_DISPLAY_TIMEZONE = "America/Argentina/Buenos_Aires";
function formatScheduleDateTime(date, locale = "es-AR", timeZone = exports.SCHEDULE_DISPLAY_TIMEZONE) {
    const d = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(d.getTime()))
        return "—";
    try {
        return d.toLocaleString(locale, {
            timeZone,
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }
    catch {
        return d.toISOString();
    }
}
function formatNextExecutionDisplay(lastRunAt, frequency, locale = "es-AR") {
    const f = (frequency || "").trim();
    if (!f)
        return "Manual";
    const next = computeNextRunAt(lastRunAt, f);
    if (!next)
        return "—";
    return formatScheduleDateTime(next, locale);
}
function parseScheduleFromLayout(layout) {
    if (!layout || typeof layout !== "object")
        return undefined;
    const guided = layout.guided_config;
    if (!guided || typeof guided !== "object")
        return undefined;
    const schedule = guided.schedule;
    if (!schedule || typeof schedule !== "object")
        return undefined;
    return schedule;
}
function resolveActiveRunGuardMinutes() {
    const raw = Number(process.env.ETL_ACTIVE_RUN_GUARD_MINUTES);
    if (Number.isFinite(raw) && raw > 0)
        return Math.floor(raw);
    return 240;
}
exports.ACTIVE_RUN_GUARD_MINUTES = resolveActiveRunGuardMinutes();
function getStaleRunMinutes() {
    const raw = Number(process.env.ETL_STALE_RUN_MINUTES);
    if (Number.isFinite(raw) && raw > 0)
        return Math.floor(raw);
    return 240;
}
function getHardStaleRunMinutes() {
    const raw = Number(process.env.ETL_HARD_STALE_RUN_MINUTES);
    if (Number.isFinite(raw) && raw > 0)
        return Math.floor(raw);
    return 480;
}
function mergeScheduleIntoGuidedConfig(guidedConfig, frequency, preserveLastRunAt) {
    const existing = guidedConfig.schedule ?? {};
    const f = (frequency ?? "").trim();
    if (!f) {
        const { schedule: _removed, ...rest } = guidedConfig;
        return rest;
    }
    const lastRunAt = existing.lastRunAt ?? preserveLastRunAt ?? undefined;
    return {
        ...guidedConfig,
        schedule: {
            ...existing,
            frequency: f,
            ...(lastRunAt ? { lastRunAt } : {}),
        },
    };
}
async function updateEtlScheduleLastRunAt(supabaseAdmin, etlId, at) {
    const now = at ?? new Date().toISOString();
    const { data: etlRow } = await supabaseAdmin.from("etl").select("layout").eq("id", etlId).single();
    const currentLayout = etlRow?.layout ?? {};
    const guidedConfig = currentLayout.guided_config ?? {};
    const schedule = guidedConfig.schedule ?? {};
    if (!(schedule.frequency ?? "").trim())
        return;
    const updatedLayout = {
        ...currentLayout,
        guided_config: {
            ...guidedConfig,
            schedule: { ...schedule, lastRunAt: now },
        },
    };
    await supabaseAdmin.from("etl").update({ layout: updatedLayout }).eq("id", etlId);
}
//# sourceMappingURL=schedule.js.map