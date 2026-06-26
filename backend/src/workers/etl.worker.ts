import { Worker } from "bullmq";
import { createServer } from "http";
import { Pool } from "pg";
import { ETL_QUEUE } from "../etl/etl.constants";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://biconic:biconic_dev_password@localhost:6432/biconic";

const pool = new Pool({ connectionString: databaseUrl, max: 5 });

function getEtlRunnerBase(): string {
  const explicit = process.env.PROCESS_EXCEL_RUNNER_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) return `https://${railwayDomain}/v1`;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");
  if (apiUrl) return apiUrl;
  return "http://localhost:4000/v1";
}

async function processEtlRun(job: {
  data: { runId: string; etlId: string; userId: string; body: Record<string, unknown> };
}) {
  const { runId, etlId } = job.data;
  await pool.query(
    `UPDATE public.etl_runs_log SET status = 'running' WHERE id = $1`,
    [runId]
  );

  try {
    const runnerBase = getEtlRunnerBase();
    const internalSecret =
      process.env.INTERNAL_ETL_SECRET ?? process.env.CRON_SECRET ?? "";
    const res = await fetch(`${runnerBase}/internal/etl/run-pipeline`, {
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

    const result = (await res.json().catch(() => ({}))) as { rowsProcessed?: number };
    const rowsProcessed =
      typeof result?.rowsProcessed === "number" ? result.rowsProcessed : null;
    if (rowsProcessed != null) {
      await pool.query(
        `UPDATE public.etl_runs_log
         SET rows_processed = COALESCE(rows_processed, $2),
             status = CASE WHEN status IN ('started', 'running') THEN 'completed' ELSE status END,
             completed_at = COALESCE(completed_at, now())
         WHERE id = $1`,
        [runId, rowsProcessed]
      );
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE public.etl_runs_log
       SET status = 'failed', error_message = $2, completed_at = now()
       WHERE id = $1`,
      [runId, message.slice(0, 2000)]
    );
    throw err;
  }
}

const worker = new Worker(ETL_QUEUE, processEtlRun, {
  connection: { url: redisUrl },
  concurrency: Number(process.env.ETL_WORKER_CONCURRENCY ?? 2),
});

worker.on("completed", (job) => {
  console.log(`[etl-worker] completed ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`[etl-worker] failed ${job?.id}:`, err.message);
});

console.log("[etl-worker] started, runner:", getEtlRunnerBase());

const healthPort = Number(process.env.PORT ?? 0);
if (Number.isFinite(healthPort) && healthPort > 0) {
  createServer((req, res) => {
    if (req.url === "/v1/health" || req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(404);
    res.end();
  }).listen(healthPort, () => {
    console.log(`[etl-worker] healthcheck listening on :${healthPort}`);
  });
}
