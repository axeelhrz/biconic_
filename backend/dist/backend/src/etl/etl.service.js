"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EtlService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const uuid_1 = require("uuid");
const run_scheduled_connections_1 = require("../../../lib/connection/run-scheduled-connections");
const guided_config_sanitize_1 = require("../../../lib/etl/guided-config-sanitize");
const schedule_1 = require("../../../lib/etl/schedule");
const database_service_1 = require("../database/database.service");
const etl_constants_1 = require("./etl.constants");
let EtlService = class EtlService {
    constructor(db, etlQueue) {
        this.db = db;
        this.etlQueue = etlQueue;
    }
    async enqueueRun(payload) {
        const runId = (0, uuid_1.v4)();
        const etl = await this.db.queryOne(`SELECT output_table FROM public.etl WHERE id = $1`, [payload.etlId]);
        const destinationTable = etl?.output_table?.replace(/^etl_output\./, "") ?? `run_${runId.replace(/-/g, "_")}`;
        await this.db.query(`INSERT INTO public.etl_runs_log
        (id, etl_id, status, destination_schema, destination_table_name, started_at)
       VALUES ($1, $2, 'started', 'etl_output', $3, now())`, [runId, payload.etlId, destinationTable]);
        await this.etlQueue.add("run", { runId, ...payload }, { jobId: runId, removeOnComplete: 100, removeOnFail: 50 });
        return { runId, status: "started", destinationTable };
    }
    async getRunStatus(runId) {
        return this.db.queryOne(`SELECT id, etl_id, status, destination_schema, destination_table_name,
              rows_processed, error_message, started_at, completed_at
       FROM public.etl_runs_log WHERE id = $1`, [runId]);
    }
    async listEtlsForUser(userId, appRole) {
        if (appRole === "APP_ADMIN") {
            return this.db.query(`SELECT * FROM public.etl ORDER BY created_at DESC`);
        }
        return this.db.query(`SELECT e.* FROM public.etl e
       JOIN public.client_members cm ON cm.client_id = e.client_id
       WHERE cm.user_id = $1
       ORDER BY e.created_at DESC`, [userId]);
    }
    async markStaleRunsFailed() {
        const staleMinutes = (0, schedule_1.getStaleRunMinutes)();
        const rows = await this.db.query(`UPDATE public.etl_runs_log
       SET status = 'failed', error_message = 'Timeout: run stale', completed_at = now()
       WHERE status IN ('started', 'running')
         AND started_at < now() - ($1::text || ' minutes')::interval
       RETURNING id`, [String(staleMinutes)]);
        return { marked: rows.length };
    }
    async runScheduled(secret) {
        const expected = process.env.CRON_SECRET ?? process.env.ETL_SCHEDULER_SECRET ?? "";
        if (!expected || secret !== expected) {
            return { error: "Unauthorized" };
        }
        const rows = await this.db.query(`SELECT id, user_id, layout FROM public.etl
       WHERE layout->'guided_config'->'schedule'->>'frequency' IS NOT NULL
         AND trim(layout->'guided_config'->'schedule'->>'frequency') <> ''
       LIMIT 200`);
        const { getIntervalMs, isDue, ACTIVE_RUN_GUARD_MINUTES } = await Promise.resolve().then(() => __importStar(require("@/lib/etl/schedule")));
        const jobs = [];
        let due = 0;
        let skippedActive = 0;
        for (const etl of rows) {
            const guided = (etl.layout?.guided_config ?? {});
            const schedule = (guided.schedule ?? {});
            const frequency = String(schedule.frequency ?? "").trim();
            const intervalMs = getIntervalMs(frequency);
            if (intervalMs == null)
                continue;
            if (!isDue(schedule.lastRunAt, intervalMs))
                continue;
            due++;
            const threshold = new Date(Date.now() - ACTIVE_RUN_GUARD_MINUTES * 60 * 1000).toISOString();
            const active = await this.db.queryOne(`SELECT id FROM public.etl_runs_log
         WHERE etl_id = $1
           AND status IN ('started', 'running')
           AND started_at >= $2
         LIMIT 1`, [etl.id, threshold]);
            if (active) {
                skippedActive++;
                continue;
            }
            let sanitizedJoin;
            const joinResult = (0, guided_config_sanitize_1.sanitizeGuidedJoinForRun)(guided.join, guided.filter);
            if (joinResult && !joinResult.ok) {
                console.warn(`[runScheduled] ETL ${etl.id} omitido: ${joinResult.error}`);
                continue;
            }
            if (joinResult?.ok) {
                sanitizedJoin = joinResult.join;
            }
            const connectionId = (0, guided_config_sanitize_1.resolvePrimaryConnectionId)(guided, sanitizedJoin);
            if (!connectionId) {
                console.warn(`[runScheduled] ETL ${etl.id} omitido: sin connectionId configurado.`);
                continue;
            }
            const conn = await this.db.queryOne(`SELECT id FROM public.connections WHERE id = $1`, [connectionId]);
            if (!conn) {
                console.warn(`[runScheduled] ETL ${etl.id} omitido: conexión ${connectionId} no encontrada.`);
                continue;
            }
            const body = {
                etlId: etl.id,
                connectionId,
                filter: guided.filter,
                union: guided.union,
                ...(sanitizedJoin ? { join: sanitizedJoin } : {}),
                clean: guided.clean,
                end: guided.end,
                schedule: guided.schedule,
                waitForCompletion: false,
                scheduled: true,
            };
            const result = await this.enqueueRun({
                etlId: etl.id,
                userId: etl.user_id,
                body,
            });
            jobs.push(result);
            try {
                await this.db.query(`UPDATE public.etl
           SET layout = jsonb_set(
             COALESCE(layout, '{}'::jsonb),
             '{guided_config,schedule,lastRunAt}',
             to_jsonb($2::text),
             true
           )
           WHERE id = $1`, [etl.id, new Date().toISOString()]);
            }
            catch (err) {
                console.warn(`[runScheduled] no se pudo actualizar lastRunAt de ${etl.id}:`, err);
            }
        }
        const connections = await (0, run_scheduled_connections_1.runScheduledConnections)(secret);
        return {
            ok: true,
            due,
            triggered: jobs.length,
            skippedActive,
            enqueued: jobs.length,
            jobs,
            connections,
        };
    }
};
exports.EtlService = EtlService;
exports.EtlService = EtlService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bullmq_1.InjectQueue)(etl_constants_1.ETL_QUEUE)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        bullmq_2.Queue])
], EtlService);
//# sourceMappingURL=etl.service.js.map