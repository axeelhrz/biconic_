import { NextRequest, NextResponse } from "next/server";
import postgres, { type JSONValue } from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
import {
  buildScheduleApiPayload,
  parseScheduleRequestBody,
  validateScheduleInput,
} from "@/lib/etl/schedule";
import {
  mergeScheduleIntoConnectionConfig,
  parseScheduleFromConnectionConfig,
  type ConnectionSchedule,
} from "@/lib/connection/schedule";

function getSql() {
  return postgres(getInternalDbUrl(), { max: 3 });
}

async function requireAdmin(): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const user = await getServerAuthUser();
  if (!user?.id) return { ok: false, status: 401, error: "No autorizado" };
  if (user.app_role !== "APP_ADMIN") {
    return { ok: false, status: 403, error: "Requiere rol de administrador" };
  }
  return { ok: true };
}

/**
 * GET /api/connections/[id]/schedule
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }

    const sql = getSql();
    try {
      const [row] = await sql<{ config: unknown }[]>`
        SELECT config FROM public.connections WHERE id = ${id} LIMIT 1
      `;
      if (!row) {
        return NextResponse.json({ ok: false, error: "Conexión no encontrada" }, { status: 404 });
      }

      const schedule = parseScheduleFromConnectionConfig(row.config) ?? {};
      return NextResponse.json({
        ok: true,
        data: buildScheduleApiPayload(schedule),
      });
    } finally {
      await sql.end();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al leer programación";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/connections/[id]/schedule
 * Body: { frequency, runAtTime?, runOnWeekdays? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const scheduleInput = parseScheduleRequestBody(body);
    const validationError = validateScheduleInput(scheduleInput);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const sql = getSql();
    try {
      const [row] = await sql<{ config: Record<string, unknown> | null }[]>`
        SELECT config FROM public.connections WHERE id = ${id} LIMIT 1
      `;
      if (!row) {
        return NextResponse.json({ ok: false, error: "Conexión no encontrada" }, { status: 404 });
      }

      const currentConfig =
        row.config && typeof row.config === "object" && !Array.isArray(row.config)
          ? row.config
          : {};
      const mergedConfig = mergeScheduleIntoConnectionConfig(currentConfig, scheduleInput);

      await sql`
        UPDATE public.connections
        SET config = ${sql.json(mergedConfig as JSONValue)}, updated_at = now()
        WHERE id = ${id}
      `;

      const schedule = (mergedConfig.schedule as ConnectionSchedule | undefined) ?? {};
      return NextResponse.json({
        ok: true,
        data: buildScheduleApiPayload(schedule),
      });
    } finally {
      await sql.end();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al guardar programación";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
