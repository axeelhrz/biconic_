"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScheduledConnections = runScheduledConnections;
const postgres_1 = __importDefault(require("postgres"));
const internal_db_url_1 = require("../db/internal-db-url");
const backend_config_1 = require("../api/backend-config");
const schedule_1 = require("../etl/schedule");
const schedule_2 = require("./schedule");
function getAppBaseUrl() {
    if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
        return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "");
    }
    if (process.env.VERCEL_URL?.trim()) {
        return `https://${process.env.VERCEL_URL.trim()}`;
    }
    return "http://localhost:3000";
}
function isExcelType(type) {
    const t = type.trim().toLowerCase();
    return t === "excel" || t === "excel_file";
}
async function etlHasActiveRun(sql, etlId) {
    const threshold = new Date(Date.now() - schedule_1.ACTIVE_RUN_GUARD_MINUTES * 60 * 1000).toISOString();
    const rows = await sql `
    SELECT id FROM public.etl_runs_log
    WHERE etl_id = ${etlId}
      AND status IN ('started', 'running')
      AND started_at >= ${threshold}
    LIMIT 1
  `;
    return rows.length > 0;
}
async function triggerExcelReimport(connectionId, dataTableId, cronSecret) {
    const internalSecret = process.env.INTERNAL_PROCESS_EXCEL_SECRET?.trim();
    if (process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT) {
        const res = await fetch(`${(0, backend_config_1.getBackendApiUrl)()}/internal/excel/run-import`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(internalSecret ? { "x-internal-process-excel": internalSecret } : {}),
            },
            body: JSON.stringify({ connectionId, dataTableId, forceReimport: true }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error(`[run-scheduled-connections] Excel reimport failed ${connectionId}/${dataTableId}: ${res.status} ${text}`);
            return false;
        }
        return true;
    }
    const baseUrl = getAppBaseUrl();
    const res = await fetch(`${baseUrl}/api/process-excel`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-cron-secret": cronSecret,
        },
        body: JSON.stringify({ connectionId, dataTableId, forceReimport: true }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[run-scheduled-connections] Excel reimport failed ${connectionId}/${dataTableId}: ${res.status} ${text}`);
        return false;
    }
    return true;
}
async function triggerEtlRun(etlId, guidedConfig, cronSecret) {
    let sanitizedJoin = guidedConfig.join;
    if (sanitizedJoin && typeof sanitizedJoin === "object" && Array.isArray(sanitizedJoin.joins)) {
        const validJoins = sanitizedJoin.joins.filter((jn) => !!jn &&
            typeof jn === "object" &&
            jn.secondaryConnectionId != null &&
            String(jn.secondaryConnectionId).trim() !== "");
        if (validJoins.length === 0) {
            sanitizedJoin = undefined;
        }
        else {
            sanitizedJoin = { ...sanitizedJoin, joins: validJoins };
        }
    }
    const body = {
        etlId,
        connectionId: guidedConfig.connectionId,
        filter: guidedConfig.filter,
        union: guidedConfig.union,
        ...(sanitizedJoin ? { join: sanitizedJoin } : {}),
        clean: guidedConfig.clean,
        end: guidedConfig.end,
        schedule: guidedConfig.schedule,
        waitForCompletion: false,
    };
    const backendUrl = (0, backend_config_1.getBackendApiUrl)();
    const res = await fetch(`${backendUrl}/etl/run`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-cron-secret": cronSecret,
            Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[run-scheduled-connections] ETL ${etlId} run failed: ${res.status} ${text}`);
        return false;
    }
    return true;
}
async function findLinkedEtlIds(sql, connectionId) {
    const rows = await sql `
    SELECT id FROM public.etl
    WHERE connection_id = ${connectionId}
       OR layout->'guided_config'->>'connectionId' = ${connectionId}
  `;
    return rows.map((r) => r.id);
}
async function runScheduledConnections(cronSecret) {
    const sql = (0, postgres_1.default)((0, internal_db_url_1.getInternalDbUrl)(), { max: 5 });
    let due = 0;
    let triggered = 0;
    let skippedActive = 0;
    let excelReimports = 0;
    let etlRuns = 0;
    try {
        const connections = await sql `
      SELECT id, type, config FROM public.connections
    `;
        for (const conn of connections) {
            const schedule = (0, schedule_2.parseScheduleFromConnectionConfig)(conn.config);
            const frequency = schedule?.frequency?.trim();
            if (!frequency)
                continue;
            const intervalMs = (0, schedule_1.getIntervalMs)(frequency);
            if (intervalMs == null)
                continue;
            if (!(0, schedule_1.isDue)(schedule?.lastRunAt, intervalMs))
                continue;
            due++;
            let connectionOk = false;
            if (isExcelType(conn.type)) {
                const tables = await sql `
          SELECT id FROM public.data_tables WHERE connection_id = ${conn.id}
        `;
                for (const table of tables) {
                    const ok = await triggerExcelReimport(conn.id, table.id, cronSecret);
                    if (ok) {
                        excelReimports++;
                        connectionOk = true;
                    }
                }
            }
            const etlIds = await findLinkedEtlIds(sql, conn.id);
            for (const etlId of etlIds) {
                if (await etlHasActiveRun(sql, etlId)) {
                    skippedActive++;
                    continue;
                }
                const [etlRow] = await sql `
          SELECT layout FROM public.etl WHERE id = ${etlId} LIMIT 1
        `;
                const layout = (etlRow?.layout ?? {});
                const guidedConfig = layout.guided_config ?? {};
                const ok = await triggerEtlRun(etlId, guidedConfig, cronSecret);
                if (ok) {
                    etlRuns++;
                    connectionOk = true;
                }
            }
            if (connectionOk) {
                await (0, schedule_2.updateConnectionScheduleLastRunAt)(conn.id);
                triggered++;
            }
        }
    }
    finally {
        await sql.end();
    }
    return { due, triggered, skippedActive, excelReimports, etlRuns };
}
//# sourceMappingURL=run-scheduled-connections.js.map