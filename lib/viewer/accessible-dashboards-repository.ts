import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
import { dashboardPublishedStatusFromRow } from "@/lib/dashboard/dashboardPublishedFromRow";
import type { Dashboard } from "@/components/dashboard/DashboardCard";
import { toSqlParams } from "@/lib/db/sql-params";

function getSql() {
  return postgres(getInternalDbUrl(), { max: 5 });
}

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

function clientDisplayName(row: {
  company_name?: string | null;
  individual_full_name?: string | null;
  name?: string | null;
  type?: string | null;
}): string {
  if (row.type === "empresa" && row.company_name?.trim()) {
    return row.company_name.trim();
  }
  if (row.individual_full_name?.trim()) {
    return row.individual_full_name.trim();
  }
  return row.company_name?.trim() || row.name?.trim() || "Cliente";
}

export type ViewerAccessibleCompany = {
  clientId: string;
  name: string;
  memberRole: string | null;
};

export type ViewerAccessibleDashboardsResult = {
  dashboards: Dashboard[];
  companies: ViewerAccessibleCompany[];
};

/**
 * Lista dashboards visibles para el usuario autenticado (rol viewer / miembro de cliente).
 * Usa Postgres directo y detecta columnas opcionales (is_active, company_name, visibility).
 */
export async function listViewerAccessibleDashboardsFromDb(): Promise<ViewerAccessibleDashboardsResult> {
  const user = await getServerAuthUser();
  if (!user?.id) {
    throw new Error("No autorizado");
  }

  const sql = getSql();
  try {
    const [
      memberActiveCol,
      permActiveCol,
      hasCompanyName,
      hasIndividualName,
      hasClientType,
      hasVisibility,
      hasPublished,
    ] = await Promise.all([
      columnExists(sql, "client_members", "is_active"),
      columnExists(sql, "dashboard_has_client_permissions", "is_active"),
      columnExists(sql, "clients", "company_name"),
      columnExists(sql, "clients", "individual_full_name"),
      columnExists(sql, "clients", "type"),
      columnExists(sql, "dashboard", "visibility"),
      columnExists(sql, "dashboard", "published"),
    ]);

    const clientNameExpr = hasCompanyName
      ? `c.company_name`
      : `c.name`;
    const individualExpr = hasIndividualName
      ? `c.individual_full_name`
      : `NULL::text`;
    const typeExpr = hasClientType ? `c.type::text` : `NULL::text`;
    const memberActiveClause = memberActiveCol
      ? `AND (cm.is_active IS DISTINCT FROM false)`
      : ``;

    const memberships = await sql.unsafe(
      `
      SELECT
        cm.id,
        cm.client_id,
        cm.role::text AS role,
        ${clientNameExpr} AS company_name,
        ${individualExpr} AS individual_full_name,
        ${typeExpr} AS client_type
      FROM public.client_members cm
      LEFT JOIN public.clients c ON c.id = cm.client_id
      WHERE cm.user_id = $1
      ${memberActiveClause}
      `,
      toSqlParams([user.id])
    ) as {
      id: string;
      client_id: string;
      role: string | null;
      company_name: string | null;
      individual_full_name: string | null;
      client_type: string | null;
    }[];

    const companies: ViewerAccessibleCompany[] = memberships.map((m) => ({
      clientId: String(m.client_id),
      name: clientDisplayName({
        company_name: m.company_name,
        individual_full_name: m.individual_full_name,
        type: m.client_type,
      }),
      memberRole: m.role,
    }));

    const userClientIds = memberships.map((m) => String(m.client_id));
    const memberIds = memberships.map((m) => String(m.id));

    type DashRow = {
      id: string;
      title: string | null;
      name: string | null;
      published: boolean | null;
      visibility: string | null;
      description: string | null;
      user_id: string | null;
      client_id: string | null;
    };

    const publishedSelect = hasPublished ? `d.published` : `false AS published`;
    const visibilitySelect = hasVisibility ? `d.visibility` : `NULL::text AS visibility`;
    const descriptionSelect = (await columnExists(sql, "dashboard", "description"))
      ? `d.description`
      : `NULL::text AS description`;

    const ownRows = (await sql.unsafe(
      `
      SELECT d.id, d.title, d.name, ${publishedSelect}, ${visibilitySelect}, ${descriptionSelect}, d.user_id, d.client_id
      FROM public.dashboard d
      WHERE d.user_id = $1
      `,
      toSqlParams([user.id])
    )) as DashRow[];

    let sharedRows: DashRow[] = [];
    if (memberIds.length > 0) {
      const permActiveClause = permActiveCol
        ? `AND (p.is_active IS DISTINCT FROM false)`
        : ``;
      sharedRows = (await sql.unsafe(
        `
        SELECT DISTINCT d.id, d.title, d.name, ${publishedSelect}, ${visibilitySelect}, ${descriptionSelect}, d.user_id, d.client_id
        FROM public.dashboard d
        INNER JOIN public.dashboard_has_client_permissions p
          ON p.dashboard_id = d.id
        WHERE p.client_member_id = ANY($1::uuid[])
        ${permActiveClause}
        `,
        toSqlParams([memberIds])
      )) as DashRow[];
    }

    let clientPublishedRows: DashRow[] = [];
    if (userClientIds.length > 0) {
      const publishedClause = hasPublished
        ? `AND d.published = true`
        : hasVisibility
          ? `AND lower(coalesce(d.visibility, '')) IN ('public', 'published', 'publicado')`
          : ``;
      clientPublishedRows = (await sql.unsafe(
        `
        SELECT d.id, d.title, d.name, ${publishedSelect}, ${visibilitySelect}, ${descriptionSelect}, d.user_id, d.client_id
        FROM public.dashboard d
        WHERE d.client_id = ANY($1::uuid[])
        ${publishedClause}
        `,
        toSqlParams([userClientIds])
      )) as DashRow[];
    }

    const byId = new Map<string, DashRow>();
    for (const r of ownRows) byId.set(String(r.id), r);
    for (const r of sharedRows) byId.set(String(r.id), r);
    for (const r of clientPublishedRows) byId.set(String(r.id), r);

    const sharedIdSet = new Set(sharedRows.map((r) => String(r.id)));
    const clientIdSet = new Set(userClientIds);

    const dashboards: Dashboard[] = Array.from(byId.values())
      .filter((row) => {
        if (row.user_id === user.id) return true;
        if (sharedIdSet.has(String(row.id))) return true;
        const cid =
          row.client_id != null && String(row.client_id).trim() !== ""
            ? String(row.client_id)
            : null;
        if (
          cid &&
          clientIdSet.has(cid) &&
          dashboardPublishedStatusFromRow({
            published: row.published,
            visibility: row.visibility,
          }) === "Publicado"
        ) {
          return true;
        }
        return false;
      })
      .map((row) => ({
        id: String(row.id),
        title: row.title?.trim() || row.name?.trim() || "Sin título",
        imageUrl: "/Image.svg",
        status: dashboardPublishedStatusFromRow({
          published: row.published,
          visibility: row.visibility,
        }),
        description: row.description ?? "",
        views: 0,
        clientId: row.client_id ?? undefined,
        ownerId: row.user_id ?? undefined,
      }));

    return { dashboards, companies };
  } finally {
    await sql.end();
  }
}
