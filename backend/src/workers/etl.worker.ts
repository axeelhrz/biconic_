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

const ETL_RUN_POLL_INTERVAL_MS =
  Number(process.env.ETL_RUN_POLL_INTERVAL_MS) > 0
    ? Number(process.env.ETL_RUN_POLL_INTERVAL_MS)
    : 5_000;
const ETL_RUN_MAX_WAIT_MS =
  Number(process.env.ETL_RUN_MAX_WAIT_MS) > 0
    ? Number(process.env.ETL_RUN_MAX_WAIT_MS)
    : 4 * 60 * 60 * 1000; // 4h: runs grandes con JOIN pueden tardar horas

/**
 * Espera a que el run termine consultando la base directamente (el worker ya tiene
 * su propia conexión a Postgres), en vez de mantener abierta la conexión HTTP hacia
 * /internal/etl/run-pipeline. Runs largos (JOIN múltiple) tardan varios minutos y el
 * borde/proxy público de Railway corta conexiones inactivas mucho antes, devolviendo
 * "502 upstream error" aunque el pipeline sigue corriendo del otro lado.
 */
async function waitForRunCompletion(
  runId: string
): Promise<{ status: string; rowsProcessed: number | null; errorMessage: string | null }> {
  const startedAt = Date.now();
  while (true) {
    const { rows } = await pool.query(
      `SELECT status, rows_processed, error_message FROM public.etl_runs_log WHERE id = $1`,
      [runId]
    );
    const row = rows[0] as
      | { status: string; rows_processed: number | null; error_message: string | null }
      | undefined;
    if (row && row.status !== "started" && row.status !== "running") {
      return {
        status: row.status,
        rowsProcessed: row.rows_processed ?? null,
        errorMessage: row.error_message ?? null,
      };
    }
    if (Date.now() - startedAt > ETL_RUN_MAX_WAIT_MS) {
      throw new Error(
        `El worker dejó de esperar el run ${runId} tras superar el tiempo máximo (${Math.round(ETL_RUN_MAX_WAIT_MS / 60000)} min); el pipeline puede seguir corriendo del lado del servidor.`
      );
    }
    await new Promise((r) => setTimeout(r, ETL_RUN_POLL_INTERVAL_MS));
  }
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
    // waitForCompletion: false → la API dispara el pipeline en background y responde
    // casi al instante. Así esta llamada nunca queda abierta el tiempo suficiente
    // como para que un proxy intermedio la corte; el progreso real se sigue por DB.
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
        waitForCompletion: false,
      }),
      signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(30_000) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ETL run no pudo iniciarse: ${res.status} ${text.slice(0, 500)}`);
    }
    await res.text().catch(() => {});

    const final = await waitForRunCompletion(runId);
    if (final.status === "failed") {
      throw new Error(final.errorMessage || "ETL run failed");
    }
    return { rowsProcessed: final.rowsProcessed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE public.etl_runs_log
       SET status = 'failed', error_message = $2, completed_at = COALESCE(completed_at, now())
       WHERE id = $1 AND status IN ('started', 'running')`,
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
