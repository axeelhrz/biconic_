import { NextResponse } from "next/server";
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

/** Membresías del viewer (compatible con schema sin is_active / company_name). */
export async function GET() {
  const sql = postgres(getInternalDbUrl(), { max: 3 });
  try {
    const user = await getServerAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const [hasActive, hasCompanyName, hasIndividual, hasType] = await Promise.all([
      columnExists(sql, "client_members", "is_active"),
      columnExists(sql, "clients", "company_name"),
      columnExists(sql, "clients", "individual_full_name"),
      columnExists(sql, "clients", "type"),
    ]);

    const nameExpr = hasCompanyName ? "c.company_name" : "c.name";
    const individualExpr = hasIndividual ? "c.individual_full_name" : "NULL::text";
    const typeExpr = hasType ? "c.type::text" : "NULL::text";
    const activeClause = hasActive ? "AND (cm.is_active IS DISTINCT FROM false)" : "";

    const rows = (await sql.unsafe(
      `
      SELECT
        cm.id,
        cm.client_id,
        cm.role::text AS role,
        json_build_object(
          'company_name', ${nameExpr},
          'individual_full_name', ${individualExpr},
          'type', ${typeExpr}
        ) AS clients
      FROM public.client_members cm
      LEFT JOIN public.clients c ON c.id = cm.client_id
      WHERE cm.user_id = $1
      ${activeClause}
      `,
      toSqlParams([user.id])
    )) as Array<{
      id: string;
      client_id: string;
      role: string | null;
      clients: {
        company_name?: string | null;
        individual_full_name?: string | null;
        type?: string | null;
      } | null;
    }>;

    return NextResponse.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await sql.end();
  }
}
