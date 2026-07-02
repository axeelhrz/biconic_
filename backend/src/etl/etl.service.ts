import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { runScheduledConnections } from "@/lib/connection/run-scheduled-connections";
import { DatabaseService } from "../database/database.service";
import { ETL_QUEUE } from "./etl.constants";

@Injectable()
export class EtlService {
  constructor(
    private readonly db: DatabaseService,
    @InjectQueue(ETL_QUEUE) private readonly etlQueue: Queue
  ) {}

  async enqueueRun(payload: {
    etlId: string;
    userId: string;
    body: Record<string, unknown>;
  }) {
    const runId = uuidv4();
    const etl = await this.db.queryOne<{ output_table: string | null }>(
      `SELECT output_table FROM public.etl WHERE id = $1`,
      [payload.etlId]
    );
    const destinationTable =
      etl?.output_table?.replace(/^etl_output\./, "") ?? `run_${runId.replace(/-/g, "_")}`;

    await this.db.query(
      `INSERT INTO public.etl_runs_log
        (id, etl_id, status, destination_schema, destination_table_name, started_at)
       VALUES ($1, $2, 'started', 'etl_output', $3, now())`,
      [runId, payload.etlId, destinationTable]
    );

    await this.etlQueue.add(
      "run",
      { runId, ...payload },
      { jobId: runId, removeOnComplete: 100, removeOnFail: 50 }
    );

    return { runId, status: "started", destinationTable };
  }

  async getRunStatus(runId: string) {
    return this.db.queryOne(
      `SELECT id, etl_id, status, destination_schema, destination_table_name,
              rows_processed, error_message, started_at, completed_at
       FROM public.etl_runs_log WHERE id = $1`,
      [runId]
    );
  }

  async listEtlsForUser(userId: string, appRole: string) {
    if (appRole === "APP_ADMIN") {
      return this.db.query(`SELECT * FROM public.etl ORDER BY created_at DESC`);
    }
    return this.db.query(
      `SELECT e.* FROM public.etl e
       JOIN public.client_members cm ON cm.client_id = e.client_id
       WHERE cm.user_id = $1
       ORDER BY e.created_at DESC`,
      [userId]
    );
  }

  async markStaleRunsFailed() {
    const rows = await this.db.query(
      `UPDATE public.etl_runs_log
       SET status = 'failed', error_message = 'Timeout: run stale', completed_at = now()
       WHERE status IN ('started', 'running')
         AND started_at < now() - interval '2 hours'
       RETURNING id`
    );
    return { marked: rows.length };
  }

  async runScheduled(secret: string) {
    const expected =
      process.env.CRON_SECRET ?? process.env.ETL_SCHEDULER_SECRET ?? "";
    if (!expected || secret !== expected) {
      return { error: "Unauthorized" };
    }
    const scheduled = await this.db.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM public.etl
       WHERE (layout->>'schedule_enabled')::boolean = true
       LIMIT 50`
    );
    const jobs = [];
    for (const etl of scheduled) {
      const result = await this.enqueueRun({
        etlId: etl.id,
        userId: etl.user_id,
        body: { scheduled: true },
      });
      jobs.push(result);
    }
    const connections = await runScheduledConnections(secret);
    return { enqueued: jobs.length, jobs, connections };
  }
}
