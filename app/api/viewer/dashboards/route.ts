import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
import { toSqlParams } from "@/lib/db/sql-params";

/** Listado legacy de dashboards para el shim del viewer. */
export async function GET(req: NextRequest) {
  const sql = postgres(getInternalDbUrl(), { max: 3 });
  try {
    const user = await getServerAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const sp = req.nextUrl.searchParams;
    const eqUserId = sp.get("eq_user_id");
    const inIds = (sp.get("in_id") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const inClientIds = (sp.get("in_client_id") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (eqUserId) {
      // Solo el propio usuario (o admin) puede pedir por user_id.
      if (eqUserId !== user.id && user.app_role !== "APP_ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const rows = await sql`
        SELECT * FROM public.dashboard WHERE user_id = ${eqUserId}
      `;
      return NextResponse.json(rows);
    }

    if (inIds.length > 0) {
      const rows = await sql`
        SELECT * FROM public.dashboard WHERE id = ANY(${inIds}::uuid[])
      `;
      return NextResponse.json(rows);
    }

    if (inClientIds.length > 0) {
      const rows = await sql`
        SELECT * FROM public.dashboard WHERE client_id = ANY(${inClientIds}::uuid[])
      `;
      return NextResponse.json(rows);
    }

    const rows = (await sql.unsafe(
      `SELECT * FROM public.dashboard WHERE user_id = $1`,
      toSqlParams([user.id])
    )) as unknown[];
    return NextResponse.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await sql.end();
  }
}
