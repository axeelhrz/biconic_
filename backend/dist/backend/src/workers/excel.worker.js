"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const etl_constants_1 = require("../etl/etl.constants");
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
async function processExcelImport(job) {
    const nextUrl = process.env.NEXT_INTERNAL_URL ?? "http://localhost:3000";
    const internalSecret = process.env.INTERNAL_PROCESS_EXCEL_SECRET ?? "";
    const res = await fetch(`${nextUrl}/api/process-excel`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(internalSecret ? { "x-internal-process-excel": internalSecret } : {}),
        },
        body: JSON.stringify({
            connectionId: job.data.connectionId,
            storageObjectPath: job.data.objectKey,
            asyncWorker: true,
        }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Excel import failed: ${res.status} ${text.slice(0, 500)}`);
    }
    return res.json();
}
const worker = new bullmq_1.Worker(etl_constants_1.EXCEL_QUEUE, processExcelImport, {
    connection: { url: redisUrl },
    concurrency: 1,
});
worker.on("completed", (job) => console.log(`[excel-worker] completed ${job.id}`));
worker.on("failed", (job, err) => console.error(`[excel-worker] failed ${job?.id}:`, err.message));
console.log("[excel-worker] started");
//# sourceMappingURL=excel.worker.js.map