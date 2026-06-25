"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
        const rows = await this.db.query(`UPDATE public.etl_runs_log
       SET status = 'failed', error_message = 'Timeout: run stale', completed_at = now()
       WHERE status IN ('started', 'running')
         AND started_at < now() - interval '2 hours'
       RETURNING id`);
        return { marked: rows.length };
    }
    async runScheduled(secret) {
        const expected = process.env.CRON_SECRET ?? process.env.ETL_SCHEDULER_SECRET ?? "";
        if (!expected || secret !== expected) {
            return { error: "Unauthorized" };
        }
        const scheduled = await this.db.query(`SELECT id, user_id FROM public.etl
       WHERE (layout->>'schedule_enabled')::boolean = true
       LIMIT 50`);
        const jobs = [];
        for (const etl of scheduled) {
            const result = await this.enqueueRun({
                etlId: etl.id,
                userId: etl.user_id,
                body: { scheduled: true },
            });
            jobs.push(result);
        }
        return { enqueued: jobs.length, jobs };
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