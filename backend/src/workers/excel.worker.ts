import { Worker } from "bullmq";
import { EXCEL_QUEUE } from "../etl/etl.constants";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

function getRunnerBase(): string {
  const explicit = process.env.PROCESS_EXCEL_RUNNER_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) return `https://${railwayDomain}/v1`;
  return (
    process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") ??
    "http://localhost:4000/v1"
  );
}

async function processExcelImport(job: {
  data: {
    connectionId: string;
    objectKey: string;
    userId: string;
    dataTableId?: string;
    parseMode?: string;
    selectedSheet?: string | null;
  };
}) {
  const runnerBase = getRunnerBase();
  const internalSecret = process.env.INTERNAL_PROCESS_EXCEL_SECRET ?? "";
  const res = await fetch(`${runnerBase}/internal/excel/run-import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(internalSecret ? { "x-internal-process-excel": internalSecret } : {}),
    },
    body: JSON.stringify({
      connectionId: job.data.connectionId,
      dataTableId: job.data.dataTableId,
      parseMode: job.data.parseMode ?? "mixed",
      selectedSheet: job.data.selectedSheet ?? null,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Excel import failed: ${res.status} ${text.slice(0, 500)}`);
  }
  return res.json();
}

const worker = new Worker(EXCEL_QUEUE, processExcelImport, {
  connection: { url: redisUrl },
  concurrency: 1,
});

worker.on("completed", (job) => console.log(`[excel-worker] completed ${job.id}`));
worker.on("failed", (job, err) => console.error(`[excel-worker] failed ${job?.id}:`, err.message));
console.log("[excel-worker] started");
