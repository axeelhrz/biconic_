import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { runScheduledConnections } from "@/lib/connection/run-scheduled-connections";
import {
  resolvePrimaryConnectionId,
  sanitizeGuidedJoinForRun,
} from "@/lib/etl/guided-config-sanitize";
import { getStaleRunMinutes } from "@/lib/etl/schedule";
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
    const staleMinutes = getStaleRunMinutes();
    const rows = await this.db.query(
      `UPDATE public.etl_runs_log
       SET status = 'failed', error_message = 'Timeout: run stale', completed_at = now()
       WHERE status IN ('started', 'running')
         AND started_at < now() - ($1::text || ' minutes')::interval
       RETURNING id`,
      [String(staleMinutes)]
    );
    return { marked: rows.length };
  }

  async runScheduled(secret: string) {
    const expected =
      process.env.CRON_SECRET ?? process.env.ETL_SCHEDULER_SECRET ?? "";
    if (!expected || secret !== expected) {
      return { error: "Unauthorized" };
    }

    // Misma forma que la UI: layout.guided_config.schedule.{frequency,lastRunAt}
    const rows = await this.db.query<{
      id: string;
      user_id: string;
      layout: Record<string, unknown> | null;
    }>(
      `SELECT id, user_id, layout FROM public.etl
       WHERE layout->'guided_config'->'schedule'->>'frequency' IS NOT NULL
         AND trim(layout->'guided_config'->'schedule'->>'frequency') <> ''
       LIMIT 200`
    );

    const { isScheduleDue, ACTIVE_RUN_GUARD_MINUTES } = await import(
      "@/lib/etl/schedule"
    );

    const jobs: Array<{ runId: string; status: string; destinationTable: string }> = [];
    let due = 0;
    let skippedActive = 0;

    for (const etl of rows) {
      const guided = (etl.layout?.guided_config ?? {}) as Record<string, unknown>;
      const schedule = (guided.schedule ?? {}) as {
        frequency?: string;
        lastRunAt?: string;
        runAtTime?: string;
        runOnWeekdays?: number[];
      };
      if (!String(schedule.frequency ?? "").trim()) continue;
      if (!isScheduleDue(schedule)) continue;
      due++;

      const threshold = new Date(
        Date.now() - ACTIVE_RUN_GUARD_MINUTES * 60 * 1000
      ).toISOString();
      const active = await this.db.queryOne<{ id: string }>(
        `SELECT id FROM public.etl_runs_log
         WHERE etl_id = $1
           AND status IN ('started', 'running')
           AND started_at >= $2
         LIMIT 1`,
        [etl.id, threshold]
      );
      if (active) {
        skippedActive++;
        continue;
      }

      let sanitizedJoin: Record<string, unknown> | undefined;
      const joinResult = sanitizeGuidedJoinForRun(guided.join, guided.filter);
      if (joinResult && !joinResult.ok) {
        console.warn(`[runScheduled] ETL ${etl.id} omitido: ${joinResult.error}`);
        continue;
      }
      if (joinResult?.ok) {
        sanitizedJoin = joinResult.join;
      }

      const connectionId = resolvePrimaryConnectionId(guided, sanitizedJoin);
      if (!connectionId) {
        console.warn(`[runScheduled] ETL ${etl.id} omitido: sin connectionId configurado.`);
        continue;
      }

      const conn = await this.db.queryOne<{ id: string }>(
        `SELECT id FROM public.connections WHERE id = $1`,
        [connectionId]
      );
      if (!conn) {
        console.warn(
          `[runScheduled] ETL ${etl.id} omitido: conexión ${connectionId} no encontrada.`
        );
        continue;
      }

      const body: Record<string, unknown> = {
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

      // Marca lastRunAt al encolar para no re-disparar en el próximo tick del cron.
      try {
        await this.db.query(
          `UPDATE public.etl
           SET layout = jsonb_set(
             COALESCE(layout, '{}'::jsonb),
             '{guided_config,schedule,lastRunAt}',
             to_jsonb($2::text),
             true
           )
           WHERE id = $1`,
          [etl.id, new Date().toISOString()]
        );
      } catch (err) {
        console.warn(`[runScheduled] no se pudo actualizar lastRunAt de ${etl.id}:`, err);
      }
    }

    const connections = await runScheduledConnections(secret);
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
}
