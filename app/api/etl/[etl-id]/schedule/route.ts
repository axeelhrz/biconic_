import { NextRequest, NextResponse } from "next/server";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  formatNextExecutionDisplay,
  formatScheduleLabel,
  mergeScheduleIntoGuidedConfig,
  parseScheduleFromLayout,
  type EtlSchedule,
} from "@/lib/etl/schedule";

function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  return supabase.auth.getUser().then(({ data: { user }, error }) => {
    if (error || !user) return { ok: false as const, status: 401, error: "No autorizado" };
    return supabase
      .from("profiles")
      .select("app_role")
      .eq("id", user.id)
      .single()
      .then(({ data: profile }) => {
        if ((profile as { app_role?: string })?.app_role !== "APP_ADMIN")
          return { ok: false as const, status: 403, error: "Requiere rol de administrador" };
        return { ok: true as const };
      });
  });
}

/**
 * GET /api/etl/[etl-id]/schedule
 * Devuelve la programación actual del ETL.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ "etl-id": string }> }
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { "etl-id": etlId } = await params;
    if (!etlId) {
      return NextResponse.json({ ok: false, error: "etl-id requerido" }, { status: 400 });
    }

    const adminClient = createServiceRoleClient();
    const { data: etlRow, error } = await adminClient.from("etl").select("layout").eq("id", etlId).maybeSingle();
    if (error || !etlRow) {
      return NextResponse.json({ ok: false, error: "ETL no encontrado" }, { status: 404 });
    }

    const schedule = parseScheduleFromLayout(etlRow.layout) ?? {};
    const frequency = schedule.frequency?.trim() || null;
    return NextResponse.json({
      ok: true,
      data: {
        frequency,
        lastRunAt: schedule.lastRunAt ?? null,
        label: formatScheduleLabel(frequency),
        nextExecution: formatNextExecutionDisplay(schedule.lastRunAt, frequency),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al leer programación";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/etl/[etl-id]/schedule
 * Guarda la frecuencia de actualización automática sin ejecutar el ETL.
 * Body: { frequency: string | null } — null o "" desactiva la programación.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ "etl-id": string }> }
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { "etl-id": etlId } = await params;
    if (!etlId) {
      return NextResponse.json({ ok: false, error: "etl-id requerido" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const frequency =
      body.frequency === null || body.frequency === undefined ? null : String(body.frequency).trim();

    const adminClient = createServiceRoleClient();
    const { data: etlRow, error: fetchError } = await adminClient
      .from("etl")
      .select("layout")
      .eq("id", etlId)
      .single();

    if (fetchError || !etlRow) {
      return NextResponse.json({ ok: false, error: "ETL no encontrado" }, { status: 404 });
    }

    const currentLayout = (etlRow as { layout?: Record<string, unknown> }).layout ?? {};
    const guidedConfig = (currentLayout.guided_config as Record<string, unknown>) ?? {};
    const mergedGuided = mergeScheduleIntoGuidedConfig(guidedConfig, frequency);
    const updatedLayout = { ...currentLayout, guided_config: mergedGuided };

    const { error: updateError } = await adminClient
      .from("etl")
      .update({ layout: updatedLayout as Json })
      .eq("id", etlId);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    const schedule = (mergedGuided.schedule as EtlSchedule | undefined) ?? {};
    const freq = schedule.frequency?.trim() || null;

    return NextResponse.json({
      ok: true,
      data: {
        frequency: freq,
        lastRunAt: schedule.lastRunAt ?? null,
        label: formatScheduleLabel(freq),
        nextExecution: formatNextExecutionDisplay(schedule.lastRunAt, freq),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al guardar programación";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
