import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { dashboardPublishedStatusFromRow } from "@/lib/dashboard/dashboardPublishedFromRow";
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

export type ViewerDashboardAccessRow = {
  id: string;
  user_id: string | null;
  client_id: string | null;
  published: boolean | null;
  visibility: string | null;
  etl_id: string | null;
  title: string | null;
  name: string | null;
  layout: unknown;
};

/**
 * Comprueba si un viewer puede abrir un dashboard (owner, permiso explícito o publicado del mismo cliente).
 * Tolerante a schemas sin `is_active` / `visibility`.
 */
export async function resolveViewerDashboardAccess(
  userId: string,
  dashboardId: string
): Promise<{ ok: true; dashboard: ViewerDashboardAccessRow } | { ok: false; status: number; error: string }> {
  const sql = postgres(getInternalDbUrl(), { max: 3 });
  try {
    const [hasPublished, hasVisibility, hasMemberActive, hasPermActive] = await Promise.all([
      columnExists(sql, "dashboard", "published"),
      columnExists(sql, "dashboard", "visibility"),
      columnExists(sql, "client_members", "is_active"),
      columnExists(sql, "dashboard_has_client_permissions", "is_active"),
    ]);

    const publishedSelect = hasPublished ? "published" : "false AS published";
    const visibilitySelect = hasVisibility ? "visibility" : "NULL::text AS visibility";

    const dashRows = (await sql.unsafe(
      `
      SELECT
        id,
        user_id,
        client_id,
        ${publishedSelect},
        ${visibilitySelect},
        etl_id,
        title,
        name,
        layout
      FROM public.dashboard
      WHERE id = $1
      LIMIT 1
      `,
      toSqlParams([dashboardId])
    )) as ViewerDashboardAccessRow[];

    const dashboard = dashRows[0];
    if (!dashboard) {
      return { ok: false, status: 404, error: "Dashboard no encontrado" };
    }

    if (dashboard.user_id === userId) {
      return { ok: true, dashboard };
    }

    const memberActiveClause = hasMemberActive
      ? "AND (is_active IS DISTINCT FROM false)"
      : "";
    const members = (await sql.unsafe(
      `
      SELECT id, client_id
      FROM public.client_members
      WHERE user_id = $1
      ${memberActiveClause}
      `,
      toSqlParams([userId])
    )) as { id: string; client_id: string }[];

    const memberIds = members.map((m) => String(m.id));
    const memberClientIds = new Set(members.map((m) => String(m.client_id)));

    if (memberIds.length > 0) {
      const permActiveClause = hasPermActive
        ? "AND (is_active IS DISTINCT FROM false)"
        : "";
      const perms = (await sql.unsafe(
        `
        SELECT id
        FROM public.dashboard_has_client_permissions
        WHERE dashboard_id = $1
          AND client_member_id = ANY($2::uuid[])
        ${permActiveClause}
        LIMIT 1
        `,
        toSqlParams([dashboardId, memberIds])
      )) as { id: string }[];
      if (perms.length > 0) {
        return { ok: true, dashboard };
      }
    }

    const cid =
      dashboard.client_id != null && String(dashboard.client_id).trim() !== ""
        ? String(dashboard.client_id)
        : null;
    if (
      cid &&
      memberClientIds.has(cid) &&
      dashboardPublishedStatusFromRow({
        published: dashboard.published,
        visibility: dashboard.visibility,
      }) === "Publicado"
    ) {
      return { ok: true, dashboard };
    }

    return { ok: false, status: 403, error: "Sin permisos para ver este dashboard" };
  } finally {
    await sql.end();
  }
}
