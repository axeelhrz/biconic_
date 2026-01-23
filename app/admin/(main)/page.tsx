import { createClient } from "@/lib/supabase/server";
import AdminDashboardSection from "@/components/admin/dashboard/AdminDashboardSection";

export default async function Page() {
  const supabase = await createClient();

  // Fetch counts in parallel
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

  return (
    <>
      <AdminDashboardSection statsCounts={statsCounts} />
    </>
  );
}
