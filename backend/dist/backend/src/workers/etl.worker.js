"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const pg_1 = require("pg");
const etl_constants_1 = require("../etl/etl.constants");
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const databaseUrl = process.env.DATABASE_URL ??
    "postgres://biconic:biconic_dev_password@localhost:6432/biconic";
const pool = new pg_1.Pool({ connectionString: databaseUrl, max: 5 });
async function processEtlRun(job) {
    const { runId, etlId } = job.data;
    await pool.query(`UPDATE public.etl_runs_log SET status = 'running' WHERE id = $1`, [runId]);
    try {
        const nextUrl = process.env.NEXT_INTERNAL_URL ?? "http://localhost:3000";
        const internalSecret = process.env.INTERNAL_ETL_SECRET ?? process.env.CRON_SECRET ?? "";
        const res = await fetch(`${nextUrl}/api/etl/run`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(internalSecret ? { "x-internal-etl": internalSecret } : {}),
            },
            body: JSON.stringify({
                ...job.data.body,
                etlId,
                runId,
                userId: job.data.userId,
                asyncWorker: true,
                waitForCompletion: true,
            }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`ETL run failed: ${res.status} ${text.slice(0, 500)}`);
        }
        const result = (await res.json().catch(() => ({})));
        const rowsProcessed = typeof result?.rowsProcessed === "number" ? result.rowsProcessed : null;
        if (rowsProcessed != null) {
            await pool.query(`UPDATE public.etl_runs_log
         SET rows_processed = COALESCE(rows_processed, $2),
             status = CASE WHEN status IN ('started', 'running') THEN 'completed' ELSE status END,
             completed_at = COALESCE(completed_at, now())
         WHERE id = $1`, [runId, rowsProcessed]);
        }
        return result;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await pool.query(`UPDATE public.etl_runs_log
       SET status = 'failed', error_message = $2, completed_at = now()
       WHERE id = $1`, [runId, message.slice(0, 2000)]);
        throw err;
    }
}
const worker = new bullmq_1.Worker(etl_constants_1.ETL_QUEUE, processEtlRun, {
    connection: { url: redisUrl },
    concurrency: Number(process.env.ETL_WORKER_CONCURRENCY ?? 2),
});
worker.on("completed", (job) => {
    console.log(`[etl-worker] completed ${job.id}`);
});
worker.on("failed", (job, err) => {
    console.error(`[etl-worker] failed ${job?.id}:`, err.message);
});
console.log("[etl-worker] started");
//# sourceMappingURL=etl.worker.js.map