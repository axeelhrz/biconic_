import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { getServerAuthUser } from "@/lib/supabase/server-backend";

export type DashboardRowForOverview = {
  id: string;
  title: string;
  published: boolean;
  clientName: string;
  clientId: string;
};

export type ClientWithCounts = {
  id: string;
  company_name: string;
  dashboardsCount: number;
  etlsCount: number;
  membersCount: number;
  status?: string | null;
  planName?: string;
};

export type AdminOverviewData = {
  statsCounts: {
    dashboards: number;
    clients: number;
    etls: number;
    connections: number;
  };
  initialAllDashboards: DashboardRowForOverview[];
  initialClients: ClientWithCounts[];
};

function getSql() {
  return postgres(getInternalDbUrl(), { max: 5 });
}

type ClientSchema = {
  nameCol: "company_name" | "name";
  hasStatus: boolean;
};

let cachedClientSchema: ClientSchema | null = null;

async function getClientSchema(sql: ReturnType<typeof postgres>): Promise<ClientSchema> {
  if (cachedClientSchema) return cachedClientSchema;
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients'
  `;
  const names = new Set(cols.map((c) => c.column_name));
  cachedClientSchema = {
    nameCol: names.has("company_name") ? "company_name" : "name",
    hasStatus: names.has("status"),
  };
  return cachedClientSchema;
}

async function requireAppAdmin() {
  const user = await getServerAuthUser();
  if (!user?.id) throw new Error("No autorizado");
  if (user.app_role !== "APP_ADMIN") throw new Error("Solo administradores");
  return user;
}

export async function getAdminOverviewFromDb(): Promise<AdminOverviewData> {
  await requireAppAdmin();
  const sql = getSql();

  try {
    const [counts] = await sql<
      {
        dashboards: string;
        clients: string;
        etls: string;
        connections: string;
      }[]
    >`
      SELECT
        (SELECT COUNT(*)::text FROM public.dashboard) AS dashboards,
        (SELECT COUNT(*)::text FROM public.clients) AS clients,
        (SELECT COUNT(*)::text FROM public.etl) AS etls,
        (SELECT COUNT(*)::text FROM public.connections) AS connections
    `;

    const { nameCol, hasStatus } = await getClientSchema(sql);

    const dashboards = await sql.unsafe<
      {
        id: string;
        title: string | null;
        published: boolean | null;
        client_id: string | null;
        client_name: string | null;
      }[]
    >(`
      SELECT
        d.id,
        d.title,
        d.published,
        d.client_id::text,
        c.${nameCol} AS client_name
      FROM public.dashboard d
      LEFT JOIN public.clients c ON c.id = d.client_id
      ORDER BY d.created_at DESC
    `);
    const statusExpr = hasStatus ? "c.status" : "NULL::text";
    const clientRows = await sql.unsafe<
      {
        id: string;
        company_name: string | null;
        status: string | null;
        dashboards_count: string;
        etls_count: string;
        members_count: string;
        plan_name: string | null;
      }[]
    >(`
      SELECT
        c.id::text,
        c.${nameCol} AS company_name,
        ${statusExpr} AS status,
        (SELECT COUNT(*)::text FROM public.dashboard d WHERE d.client_id = c.id) AS dashboards_count,
        (SELECT COUNT(*)::text FROM public.etl e WHERE e.client_id = c.id) AS etls_count,
        (SELECT COUNT(*)::text FROM public.client_members cm WHERE cm.client_id = c.id) AS members_count,
        (
          SELECT p.name
          FROM public.subscriptions s
          LEFT JOIN public.plans p ON p.id = s.plan_id
          WHERE s.client_id = c.id
          ORDER BY s.created_at DESC
          LIMIT 1
        ) AS plan_name
      FROM public.clients c
      ORDER BY c.${nameCol} ASC
    `);

    const initialAllDashboards: DashboardRowForOverview[] = dashboards.map((d) => ({
      id: d.id,
      title: d.title?.trim() || "Sin título",
      published: d.published === true,
      clientName: d.client_name?.trim() || "—",
      clientId: d.client_id ?? "",
    }));

    const initialClients: ClientWithCounts[] = clientRows.map((row) => ({
      id: row.id,
      company_name: row.company_name?.trim() || "Sin nombre",
      dashboardsCount: Number(row.dashboards_count) || 0,
      etlsCount: Number(row.etls_count) || 0,
      membersCount: Number(row.members_count) || 0,
      status: row.status,
      planName: row.plan_name ?? undefined,
    }));

    return {
      statsCounts: {
        dashboards: Number(counts?.dashboards) || 0,
        clients: Number(counts?.clients) || 0,
        etls: Number(counts?.etls) || 0,
        connections: Number(counts?.connections) || 0,
      },
      initialAllDashboards,
      initialClients,
    };
  } finally {
    await sql.end();
  }
}
