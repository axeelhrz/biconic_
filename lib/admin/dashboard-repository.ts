import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
import type { Dashboard } from "@/components/dashboard/DashboardCard";
import { dashboardPublishedStatusFromRow } from "@/lib/dashboard/dashboardPublishedFromRow";
import { resolveDashboardCoverImageUrl } from "@/lib/dashboard/dashboardCoverImage";

function getSql() {
  return postgres(getInternalDbUrl(), { max: 5 });
}

async function requireAppAdmin() {
  const user = await getServerAuthUser();
  if (!user?.id) throw new Error("No autorizado");
  if (user.app_role !== "APP_ADMIN") throw new Error("Solo administradores");
  return user;
}

export async function listAdminDashboardsForGridFromDb(): Promise<Dashboard[]> {
  await requireAppAdmin();
  const sql = getSql();

  try {
    const rows = await sql<
      {
        id: string;
        title: string | null;
        name: string;
        published: boolean | null;
        layout: Dashboard["layout"] | null;
        user_id: string | null;
        client_id: string | null;
        owner_full_name: string | null;
        client_label: string | null;
      }[]
    >`
      SELECT
        d.id,
        d.title,
        d.name,
        d.published,
        d.layout,
        d.user_id,
        d.client_id,
        p.full_name AS owner_full_name,
        COALESCE(
          NULLIF(TRIM(c.company_name), ''),
          NULLIF(TRIM(c.individual_full_name), ''),
          NULLIF(TRIM(c.name), '')
        ) AS client_label
      FROM public.dashboard d
      LEFT JOIN public.profiles p ON p.id = d.user_id
      LEFT JOIN public.clients c ON c.id = d.client_id
      ORDER BY client_label NULLS LAST, d.title ASC NULLS LAST, d.created_at DESC
    `;

    return rows.map((row) => ({
      id: String(row.id),
      title: row.title?.trim() || row.name?.trim() || "Sin título",
      imageUrl: resolveDashboardCoverImageUrl({ layout: row.layout }),
      status: dashboardPublishedStatusFromRow({ published: row.published }),
      description: "",
      views: 0,
      owner: { fullName: row.owner_full_name ?? "Desconocido" },
      clientId: row.client_id ?? undefined,
      clientLabel: row.client_label ?? undefined,
      ownerId: row.user_id ?? undefined,
      layout: row.layout ?? undefined,
    }));
  } finally {
    await sql.end();
  }
}

export type ClientSearchResult = { id: string; name: string };

let cachedClientNameCol: "company_name" | "name" | null = null;

async function getClientNameColumn(sql: ReturnType<typeof postgres>): Promise<"company_name" | "name"> {
  if (cachedClientNameCol) return cachedClientNameCol;
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients'
      AND column_name IN ('company_name', 'name')
  `;
  const names = new Set(cols.map((c) => c.column_name));
  cachedClientNameCol = names.has("company_name") ? "company_name" : "name";
  return cachedClientNameCol;
}

export async function searchClientsFromDb(query: string): Promise<ClientSearchResult[]> {
  await requireAppAdmin();
  const sql = getSql();
  const trimmed = query.trim();

  try {
    const nameCol = await getClientNameColumn(sql);
    const hasIndividual = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'clients'
          AND column_name = 'individual_full_name'
      ) AS exists
    `;
    const individualCol = hasIndividual[0]?.exists ? "individual_full_name" : null;

    const pattern = `%${trimmed}%`;
    const rows = trimmed
      ? individualCol
        ? await sql.unsafe<ClientSearchResult[]>(
            `
            SELECT id::text AS id,
              COALESCE(NULLIF(TRIM(${nameCol}), ''), NULLIF(TRIM(${individualCol}), ''), 'Sin nombre') AS name
            FROM public.clients
            WHERE ${nameCol} ILIKE $1 OR ${individualCol} ILIKE $1
            ORDER BY ${nameCol} ASC
            LIMIT 20
            `,
            [pattern]
          )
        : await sql.unsafe<ClientSearchResult[]>(
            `
            SELECT id::text AS id,
              COALESCE(NULLIF(TRIM(${nameCol}), ''), 'Sin nombre') AS name
            FROM public.clients
            WHERE ${nameCol} ILIKE $1
            ORDER BY ${nameCol} ASC
            LIMIT 20
            `,
            [pattern]
          )
      : await sql.unsafe<ClientSearchResult[]>(
          `
          SELECT id::text AS id,
            COALESCE(NULLIF(TRIM(${nameCol}), ''), 'Sin nombre') AS name
          FROM public.clients
          ORDER BY ${nameCol} ASC
          LIMIT 20
          `
        );

    return rows;
  } finally {
    await sql.end();
  }
}

export async function publishDashboardFromDb(dashboardId: string, published: boolean) {
  await requireAppAdmin();
  const sql = getSql();
  try {
    const visibility = published ? "public" : "private";
    const rows = await sql<{ id: string }[]>`
      UPDATE public.dashboard
      SET published = ${published},
          visibility = ${visibility},
          updated_at = now()
      WHERE id = ${dashboardId}
      RETURNING id
    `;
    if (!rows[0]) throw new Error("Dashboard no encontrado");
    return { ok: true as const };
  } finally {
    await sql.end();
  }
}

export async function deleteDashboardFromDb(dashboardId: string) {
  const sql = getSql();
  try {
    const rows = await sql<{ id: string }[]>`
      DELETE FROM public.dashboard
      WHERE id = ${dashboardId}
      RETURNING id
    `;
    if (!rows[0]) throw new Error("Dashboard no encontrado");
    return { ok: true as const };
  } finally {
    await sql.end();
  }
}

export async function verifyDashboardEditAccessFromDb(
  dashboardId: string,
  userId: string,
  jwtAppRole?: string
): Promise<boolean> {
  if (jwtAppRole === "APP_ADMIN") return true;

  const sql = getSql();
  try {
    const [profile] = await sql<{ app_role: string }[]>`
      SELECT app_role FROM public.profiles WHERE id = ${userId} LIMIT 1
    `;
    if (profile?.app_role === "APP_ADMIN") return true;

    const [dashboard] = await sql<{ user_id: string | null; client_id: string | null }[]>`
      SELECT user_id, client_id FROM public.dashboard WHERE id = ${dashboardId} LIMIT 1
    `;
    if (!dashboard) return false;
    if (dashboard.user_id === userId) return true;
    if (!dashboard.client_id) return false;

    const [membership] = await sql<{ id: string; role: string }[]>`
      SELECT id, role FROM public.client_members
      WHERE client_id = ${dashboard.client_id} AND user_id = ${userId}
      LIMIT 1
    `;
    if (!membership) return false;
    if (membership.role === "admin") return true;

    const [permission] = await sql<{ permission_type: string }[]>`
      SELECT permission_type FROM public.dashboard_has_client_permissions
      WHERE dashboard_id = ${dashboardId} AND client_member_id = ${membership.id}
      LIMIT 1
    `;
    return permission?.permission_type === "UPDATE";
  } finally {
    await sql.end();
  }
}
