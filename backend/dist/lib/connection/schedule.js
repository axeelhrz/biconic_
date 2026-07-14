"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatScheduleLabel = exports.formatNextExecutionDisplay = exports.ETL_SCHEDULE_FREQUENCIES = void 0;
exports.parseScheduleFromConnectionConfig = parseScheduleFromConnectionConfig;
exports.mergeScheduleIntoConnectionConfig = mergeScheduleIntoConnectionConfig;
exports.updateConnectionScheduleLastRunAt = updateConnectionScheduleLastRunAt;
const postgres_1 = __importDefault(require("postgres"));
const internal_db_url_1 = require("../db/internal-db-url");
const schedule_1 = require("../etl/schedule");
Object.defineProperty(exports, "ETL_SCHEDULE_FREQUENCIES", { enumerable: true, get: function () { return schedule_1.ETL_SCHEDULE_FREQUENCIES; } });
Object.defineProperty(exports, "formatNextExecutionDisplay", { enumerable: true, get: function () { return schedule_1.formatNextExecutionDisplay; } });
Object.defineProperty(exports, "formatScheduleLabel", { enumerable: true, get: function () { return schedule_1.formatScheduleLabel; } });
function parseScheduleFromConnectionConfig(config) {
    if (!config || typeof config !== "object" || Array.isArray(config))
        return undefined;
    const schedule = config.schedule;
    if (!schedule || typeof schedule !== "object" || Array.isArray(schedule))
        return undefined;
    return schedule;
}
function mergeScheduleIntoConnectionConfig(config, frequency, preserveLastRunAt) {
    const base = { ...(config ?? {}) };
    const existing = base.schedule ?? {};
    const f = (frequency ?? "").trim();
    if (!f) {
        const { schedule: _removed, ...rest } = base;
        return rest;
    }
    const lastRunAt = existing.lastRunAt ?? preserveLastRunAt ?? undefined;
    return {
        ...base,
        schedule: {
            ...existing,
            frequency: f,
            ...(lastRunAt ? { lastRunAt } : {}),
        },
    };
}
async function updateConnectionScheduleLastRunAt(connectionId, at) {
    const now = at ?? new Date().toISOString();
    const sql = (0, postgres_1.default)((0, internal_db_url_1.getInternalDbUrl)(), { max: 2 });
    try {
        const [row] = await sql `
      SELECT config FROM public.connections WHERE id = ${connectionId} LIMIT 1
    `;
        if (!row)
            return;
        const config = (row.config && typeof row.config === "object" ? row.config : {});
        const schedule = config.schedule ?? {};
        if (!(schedule.frequency ?? "").trim())
            return;
        const updatedConfig = {
            ...config,
            schedule: { ...schedule, lastRunAt: now },
        };
        await sql `
      UPDATE public.connections
      SET config = ${sql.json(updatedConfig)}, updated_at = now()
      WHERE id = ${connectionId}
    `;
    }
    finally {
        await sql.end();
    }
}
//# sourceMappingURL=schedule.js.map