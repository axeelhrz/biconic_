import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
import { toSqlParams } from "@/lib/db/sql-params";

async function columnExists(
  sql: ReturnType<typeof postgres>,
  table: string,
  column: string
): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

/** Permisos de dashboard por client_member (compatible sin columna is_active). */
export async function GET(req: NextRequest) {
  const sql = postgres(getInternalDbUrl(), { max: 3 });
  try {
    const user = await getServerAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const memberIdsParam = req.nextUrl.searchParams.get("memberIds") ?? "";
    const memberIds = memberIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (memberIds.length === 0) {
      return NextResponse.json([]);
    }

    const hasActive = await columnExists(
      sql,
      "dashboard_has_client_permissions",
      "is_active"
    );
    const activeClause = hasActive ? "AND (is_active IS DISTINCT FROM false)" : "";

    const rows = (await sql.unsafe(
      `
      SELECT dashboard_id, client_member_id, ${hasActive ? "is_active" : "true AS is_active"}
      FROM public.dashboard_has_client_permissions
      WHERE client_member_id = ANY($1::uuid[])
      ${activeClause}
      `,
      toSqlParams([memberIds])
    )) as Array<{
      dashboard_id: string | null;
      client_member_id: string | null;
      is_active: boolean | null;
    }>;

    return NextResponse.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await sql.end();
  }
}
