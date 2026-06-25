import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { toSqlParams } from "@/lib/db/sql-params";
import { getServerAuthUser } from "@/lib/supabase/server-backend";

function getSql() {
  return postgres(getInternalDbUrl(), { max: 5 });
}

async function isAppAdmin(userId: string, appRole?: string): Promise<boolean> {
  if (appRole === "APP_ADMIN") return true;
  const sql = getSql();
  try {
    const [profile] = await sql<{ app_role: string }[]>`
      SELECT app_role FROM public.profiles WHERE id = ${userId} LIMIT 1
    `;
    return profile?.app_role === "APP_ADMIN";
  } finally {
    await sql.end();
  }
}

export type EtlRunsQuery = {
  columns?: string;
  eq?: Record<string, string>;
  in?: Record<string, string[]>;
  order?: { column: string; ascending: boolean };
  limit?: number;
};

function parseColumns(raw?: string): string {
  if (!raw || raw === "*") return "*";
  const cols = raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => `"${c.replace(/"/g, "")}"`);
  return cols.length ? cols.join(", ") : "*";
}

export async function queryEtlRunsFromDb(query: EtlRunsQuery) {
  const user = await getServerAuthUser();
  if (!user?.id) throw new Error("No autorizado");

  const hasScopedFilter = Boolean(
    query.eq?.etl_id || query.in?.etl_id?.length || query.eq?.id
  );
  if (!hasScopedFilter && !(await isAppAdmin(user.id, user.app_role))) {
    throw new Error("Solo administradores");
  }

  const sql = getSql();
  try {
    const conditions: string[] = [];
    const vals: unknown[] = [];

    if (query.eq) {
      for (const [col, val] of Object.entries(query.eq)) {
        vals.push(val);
        conditions.push(`"${col.replace(/"/g, "")}" = $${vals.length}`);
      }
    }
    if (query.in) {
      for (const [col, arr] of Object.entries(query.in)) {
        if (!arr.length) continue;
        vals.push(arr);
        conditions.push(`"${col.replace(/"/g, "")}" = ANY($${vals.length})`);
      }
    }

    let q = `SELECT ${parseColumns(query.columns)} FROM public.etl_runs_log`;
    if (conditions.length) q += ` WHERE ${conditions.join(" AND ")}`;
    if (query.order?.column) {
      const dir = query.order.ascending ? "ASC" : "DESC";
      q += ` ORDER BY "${query.order.column.replace(/"/g, "")}" ${dir}`;
    }
    if (query.limit) q += ` LIMIT ${Math.min(Math.max(1, query.limit), 500)}`;

    return (await sql.unsafe(q, toSqlParams(vals))) as Record<string, unknown>[];
  } finally {
    await sql.end();
  }
}

export async function deleteEtlRunsFromDb(ids: string[]) {
  const user = await getServerAuthUser();
  if (!user?.id) throw new Error("No autorizado");
  if (!(await isAppAdmin(user.id, user.app_role))) {
    throw new Error("Solo administradores");
  }
  if (!ids.length) return;

  const sql = getSql();
  try {
    await sql`DELETE FROM public.etl_runs_log WHERE id = ANY(${ids}::uuid[])`;
  } finally {
    await sql.end();
  }
}
