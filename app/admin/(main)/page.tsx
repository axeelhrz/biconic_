import { getAdminOverviewFromDb, type DashboardRowForOverview } from "@/lib/admin/overview-repository";
import AdminOverviewPanel from "@/components/admin/dashboard/AdminOverviewPanel";

export type { DashboardRowForOverview };

export default async function Page() {
  const overview = await getAdminOverviewFromDb();
  return (
    <AdminOverviewPanel
      statsCounts={overview.statsCounts}
      initialAllDashboards={overview.initialAllDashboards}
      initialClients={overview.initialClients}
    />
  );
}
