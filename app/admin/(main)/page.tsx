import { createClient } from "@/lib/supabase/server";
import AdminOverviewPanel from "@/components/admin/dashboard/AdminOverviewPanel";

export type DashboardRowForOverview = {
  id: string;
  title: string;
  published: boolean;
  clientName: string;
  clientId: string;
};

export default async function Page() {
  const supabase = await createClient();

  const [
    { count: dashboardCount },
    { count: clientsCount },
    { count: etlCount },
    { count: connectionsCount },
    { data: dashData, error: dashErr },
  ] = await Promise.all([
    supabase.from("dashboard").select("*", { count: "exact", head: true }),
    supabase.from("clients").select("*", { count: "exact", head: true }),
    supabase.from("etl").select("*", { count: "exact", head: true }),
    supabase.from("connections").select("*", { count: "exact", head: true }),
    supabase
      .from("dashboard")
      .select("id, title, published, client_id, clients(company_name)")
      .order("created_at", { ascending: false }),
  ]);

  const initialAllDashboards: DashboardRowForOverview[] =
    !dashErr && Array.isArray(dashData)
      ? dashData.map((d: any) => ({
          id: d.id,
          title: d.title ?? "Sin título",
          published: !!d.published,
          clientName: d.clients?.company_name ?? "—",
          clientId: d.client_id != null ? String(d.client_id) : "",
        }))
      : [];

  const statsCounts = {
    dashboards: dashboardCount ?? 0,
    clients: clientsCount ?? 0,
    etls: etlCount ?? 0,
    connections: connectionsCount ?? 0,
  };

  return (
    <AdminOverviewPanel
      statsCounts={statsCounts}
      initialAllDashboards={initialAllDashboards}
    />
  );
}
