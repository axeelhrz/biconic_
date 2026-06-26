import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  executeEtlPipeline,
  markStaleRunsForEtl,
  type RunBody,
} from "@/lib/etl/execute-etl-pipeline";
import { createEtlPipelineContext } from "@/lib/etl/etl-run-context";

@Controller("internal/etl")
export class EtlInternalController {
  @Post("run-pipeline")
  async runPipeline(
    @Body()
    body: RunBody & {
      runId?: string;
      userId?: string;
      asyncWorker?: boolean;
      waitForCompletion?: boolean;
    },
    @Headers("x-internal-etl") internalSecret?: string
  ) {
    const expected =
      process.env.INTERNAL_ETL_SECRET?.trim() ??
      process.env.CRON_SECRET?.trim();
    if (expected && internalSecret !== expected) {
      throw new UnauthorizedException("No autorizado");
    }

    const runId = body.runId ? String(body.runId) : uuidv4();
    const supabaseAdmin = createServiceRoleClient();

    let user: { id: string } | null = body.userId
      ? { id: String(body.userId) }
      : null;
    if (!user && body.etlId) {
      const { data: etlRow } = await supabaseAdmin
        .from("etl")
        .select("user_id")
        .eq("id", body.etlId)
        .single();
      if (etlRow?.user_id) user = { id: (etlRow as { user_id: string }).user_id };
    }
    if (!user) {
      throw new UnauthorizedException("Usuario no identificado para el ETL");
    }

    if (body.etlId) {
      await markStaleRunsForEtl(supabaseAdmin, body.etlId).catch(() => {});
    }

    await supabaseAdmin
      .from("etl_runs_log")
      .update({ status: "running" })
      .eq("id", runId);

    const ctx = createEtlPipelineContext();
    const waitForCompletion = body.waitForCompletion !== false;

    if (!waitForCompletion) {
      void executeEtlPipeline(body, runId, supabaseAdmin, user, ctx).catch((err) => {
        console.error("[internal/etl/run-pipeline] background error:", err);
      });
      return { ok: true, runId, status: "started" };
    }

    const rowsProcessed = await executeEtlPipeline(
      body,
      runId,
      supabaseAdmin,
      user,
      ctx
    );
    return { ok: true, runId, completed: true, rowsProcessed };
  }
}
