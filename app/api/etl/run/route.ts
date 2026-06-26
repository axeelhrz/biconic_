import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { v4 as uuidv4 } from "uuid";
import { shouldUseOwnBackend, proxyToBackend } from "@/lib/api/backend-proxy";
import {
  executeEtlPipeline,
  ensureRunTerminalState,
  markStaleRunsForEtl,
  type RunBody,
} from "@/lib/etl/execute-etl-pipeline";
import { createEtlPipelineContext } from "@/lib/etl/etl-run-context";

/** Límite Vercel: Hobby 300s, Pro 800s (máx). El pipeline pesado corre en Railway vía etl-worker. */
export const maxDuration = 800;

export async function POST(req: NextRequest) {
  const internalEtl = req.headers.get("x-internal-etl");
  const expectedInternal =
    process.env.INTERNAL_ETL_SECRET ?? process.env.CRON_SECRET ?? "";
  const isWorkerCallback =
    !!internalEtl && !!expectedInternal && internalEtl === expectedInternal;

  if (shouldUseOwnBackend() && !isWorkerCallback) {
    const proxied = await proxyToBackend(req, "/etl/run");
    const text = await proxied.text();
    if (proxied.ok && text.trim()) {
      try {
        const json = JSON.parse(text) as { ok?: boolean; runId?: string };
        if (json.runId && json.ok !== true) {
          return NextResponse.json({ ok: true, ...json });
        }
      } catch {
        /* respuesta no JSON */
      }
    }
    return new NextResponse(text, {
      status: proxied.status,
      headers: {
        "content-type": proxied.headers.get("content-type") ?? "application/json",
      },
    });
  }

  let runId = uuidv4();
  let runLogInserted = false;

  try {
    const body = (await req.json()) as RunBody | null;
    if (!body) throw new Error("Cuerpo vacío");

    runId = isWorkerCallback && body.runId ? String(body.runId) : runId;

    const supabaseAdmin = isWorkerCallback
      ? createServiceRoleClient()
      : await createClient();
    let user: { id: string } | null = null;
    const cronSecret = req.headers.get("x-cron-secret");
    const validCronSecret =
      process.env.ETL_SCHEDULER_SECRET || process.env.CRON_SECRET;

    if (isWorkerCallback) {
      if (body.userId) {
        user = { id: String(body.userId) };
      } else if (body.etlId) {
        const serviceClient = createServiceRoleClient();
        const { data: etlRow } = await serviceClient
          .from("etl")
          .select("user_id")
          .eq("id", body.etlId)
          .single();
        if (etlRow?.user_id) user = { id: (etlRow as { user_id: string }).user_id };
      }
    } else if (
      body.etlId &&
      cronSecret &&
      validCronSecret &&
      cronSecret === validCronSecret
    ) {
      const serviceClient = createServiceRoleClient();
      const { data: etlRow } = await serviceClient
        .from("etl")
        .select("user_id")
        .eq("id", body.etlId)
        .single();
      if (etlRow?.user_id) user = { id: (etlRow as { user_id: string }).user_id };
    }

    if (!user) {
      const {
        data: { user: authUser },
      } = await supabaseAdmin.auth.getUser();
      user = authUser;
    }
    if (!user) throw new Error("No autorizado");

    if (body.etlId) {
      try {
        await markStaleRunsForEtl(supabaseAdmin, body.etlId);
      } catch (cleanupErr) {
        console.warn("[ETL] No se pudieron cerrar runs stale al iniciar:", cleanupErr);
      }
    }

    const rawTable = body.end?.target?.table?.trim();
    const cleanTable = rawTable
      ? rawTable.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()
      : "";

    if (!isWorkerCallback) {
      await supabaseAdmin
        .from("etl_runs_log")
        .insert({
          id: runId,
          etl_id: body.etlId,
          status: "started",
          destination_schema: "etl_output",
          destination_table_name: cleanTable,
        })
        .throwOnError();
      runLogInserted = true;
    } else {
      runLogInserted = true;
    }

    if (body.etlId) {
      try {
        const { data: etlRow } = await supabaseAdmin
          .from("etl")
          .select("layout")
          .eq("id", body.etlId)
          .single();
        const currentLayout = (etlRow as any)?.layout ?? {};
        const guidedConfig = {
          connectionId:
            body.connectionId ??
            (body.union as any)?.left?.connectionId ??
            (body.join as any)?.primaryConnectionId,
          filter: body.filter ?? (body.union as any)?.left?.filter,
          union: body.union,
          join: body.join,
          clean: body.clean,
          end: body.end,
          ...((body as any).schedule != null && { schedule: (body as any).schedule }),
        };
        await supabaseAdmin
          .from("etl")
          .update({ layout: { ...currentLayout, guided_config: guidedConfig } } as any)
          .eq("id", body.etlId);
      } catch (_) {}
    }

    const ctx = createEtlPipelineContext({
      cookieHeader: req.headers.get("cookie"),
    });
    const pipelinePromise = executeEtlPipeline(body, runId, supabaseAdmin, user, ctx);
    const waitForCompletion = isWorkerCallback || body.waitForCompletion;

    if (waitForCompletion) {
      const rowsProcessed = await pipelinePromise;
      return NextResponse.json({
        ok: true,
        runId,
        completed: true,
        rowsProcessed,
        message: "ETL completado. Los datos están listos.",
      });
    }

    pipelinePromise.catch((err) => console.error("Unhandled background ETL error:", err));
    const { after } = await import("next/server");
    after(() => pipelinePromise);
    return NextResponse.json({
      ok: true,
      runId,
      message:
        "Proceso ETL iniciado en segundo plano. Monitoree el progreso vía realtime o logs.",
    });
  } catch (err: any) {
    console.error("Error initiating ETL run:", err);
    if (runLogInserted) {
      try {
        const admin = await createServiceRoleClient();
        const initBuildRef =
          process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
          process.env.VERCEL_URL ||
          "local";
        await ensureRunTerminalState(admin, runId, "failed", {
          completed_at: new Date().toISOString(),
          error_message: `${String(err?.message || "Error al iniciar ETL").slice(0, 420)} | ref=${initBuildRef}`.slice(
            0,
            500
          ),
        });
      } catch (logErr) {
        console.error("Error marking failed run during initialization:", logErr);
      }
    }
    const statusCode =
      typeof err?.status === "number" && err.status >= 400 && err.status < 600
        ? err.status
        : 500;
    return NextResponse.json(
      { ok: false, error: err?.message || "Error al iniciar ETL" },
      { status: statusCode }
    );
  }
}
