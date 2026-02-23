import { createClient } from "@/lib/supabase/server";
import AdminOverviewPanel from "@/components/admin/dashboard/AdminOverviewPanel";

export default async function Page() {
  const supabase = await createClient();

  const [
    { count: dashboardCount },
    { count: clientsCount },
    { count: etlCount },
    { count: connectionsCount },
  ] = await Promise.all([
    supabase.from("dashboard").select("*", { count: "exact", head: true }),
    supabase.from("clients").select("*", { count: "exact", head: true }),
    supabase.from("etl").select("*", { count: "exact", head: true }),
    supabase.from("connections").select("*", { count: "exact", head: true }),
  ]);

  const statsCounts = {
    dashboards: dashboardCount || 0,
    clients: clientsCount || 0,
    etls: etlCount || 0,
    connections: connectionsCount || 0,
  };

  return <AdminOverviewPanel statsCounts={statsCounts} />;
}
