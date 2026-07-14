import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { getBackendApiUrl } from "@/lib/api/backend-config";
import { ACTIVE_RUN_GUARD_MINUTES, isScheduleDue } from "@/lib/etl/schedule";
import {
  parseScheduleFromConnectionConfig,
  updateConnectionScheduleLastRunAt,
  type ConnectionSchedule,
} from "@/lib/connection/schedule";

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim()}`;
  }
  return "http://localhost:3000";
}

export type RunScheduledConnectionsResult = {
  due: number;
  triggered: number;
  skippedActive: number;
  excelReimports: number;
  etlRuns: number;
};

function isExcelType(type: string): boolean {
  const t = type.trim().toLowerCase();
  return t === "excel" || t === "excel_file";
}

async function etlHasActiveRun(sql: ReturnType<typeof postgres>, etlId: string): Promise<boolean> {
  const threshold = new Date(Date.now() - ACTIVE_RUN_GUARD_MINUTES * 60 * 1000).toISOString();
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM public.etl_runs_log
    WHERE etl_id = ${etlId}
      AND status IN ('started', 'running')
      AND started_at >= ${threshold}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function triggerExcelReimport(
  connectionId: string,
  dataTableId: string,
  cronSecret: string
): Promise<boolean> {
  const internalSecret = process.env.INTERNAL_PROCESS_EXCEL_SECRET?.trim();
  if (process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT) {
    const res = await fetch(`${getBackendApiUrl()}/internal/excel/run-import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(internalSecret ? { "x-internal-process-excel": internalSecret } : {}),
      },
      body: JSON.stringify({ connectionId, dataTableId, forceReimport: true }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[run-scheduled-connections] Excel reimport failed ${connectionId}/${dataTableId}: ${res.status} ${text}`
      );
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
    console.error(
      `[run-scheduled-connections] Excel reimport failed ${connectionId}/${dataTableId}: ${res.status} ${text}`
    );
    return false;
  }
  return true;
}

async function triggerEtlRun(
  etlId: string,
  guidedConfig: Record<string, unknown>,
  cronSecret: string
): Promise<boolean> {
  let sanitizedJoin = guidedConfig.join as Record<string, unknown> | undefined;
  if (sanitizedJoin && typeof sanitizedJoin === "object" && Array.isArray(sanitizedJoin.joins)) {
    const validJoins = (sanitizedJoin.joins as Record<string, unknown>[]).filter(
      (jn) =>
        !!jn &&
        typeof jn === "object" &&
        jn.secondaryConnectionId != null &&
        String(jn.secondaryConnectionId).trim() !== ""
    );
    if (validJoins.length === 0) {
      sanitizedJoin = undefined;
    } else {
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

  // Preferir backend Nest directo (Railway) con secret; evita proxy Next sin auth.
  const backendUrl = getBackendApiUrl();
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

async function findLinkedEtlIds(sql: postgres.Sql, connectionId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM public.etl
    WHERE connection_id = ${connectionId}
       OR layout->'guided_config'->>'connectionId' = ${connectionId}
  `;
  return rows.map((r) => r.id);
}

/**
 * Ejecuta actualizaciones programadas a nivel conexión:
 * - Excel: reimporta desde el archivo guardado.
 * - Todas: dispara ETLs vinculados para traer datos nuevos a tablas destino.
 */
export async function runScheduledConnections(
  cronSecret: string
): Promise<RunScheduledConnectionsResult> {
  const sql = postgres(getInternalDbUrl(), { max: 5 });
  let due = 0;
  let triggered = 0;
  let skippedActive = 0;
  let excelReimports = 0;
  let etlRuns = 0;

  try {
    const connections = await sql<{ id: string; type: string; config: unknown }[]>`
      SELECT id, type, config FROM public.connections
    `;

    for (const conn of connections) {
      const schedule = parseScheduleFromConnectionConfig(conn.config) as
        | ConnectionSchedule
        | undefined;
      if (!schedule?.frequency?.trim()) continue;
      if (!isScheduleDue(schedule)) continue;

      due++;
      let connectionOk = false;

      if (isExcelType(conn.type)) {
        const tables = await sql<{ id: string }[]>`
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

        const [etlRow] = await sql<{ layout: Record<string, unknown> | null }[]>`
          SELECT layout FROM public.etl WHERE id = ${etlId} LIMIT 1
        `;
        const layout = (etlRow?.layout ?? {}) as Record<string, unknown>;
        const guidedConfig = (layout.guided_config as Record<string, unknown>) ?? {};
        const ok = await triggerEtlRun(etlId, guidedConfig, cronSecret);
        if (ok) {
          etlRuns++;
          connectionOk = true;
        }
      }

      if (connectionOk) {
        await updateConnectionScheduleLastRunAt(conn.id);
        triggered++;
      }
    }
  } finally {
    await sql.end();
  }

  return { due, triggered, skippedActive, excelReimports, etlRuns };
}
