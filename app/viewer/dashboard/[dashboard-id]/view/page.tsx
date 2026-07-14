import DashboardViewer from "@/components/dashboard/DashboardViewer";
import "@/app/(main)/dashboard/[dashboard-id]/view/client-dashboard-view.css";

type PageProps = {
  params: Promise<{ "dashboard-id": string }>;
};

export default async function Page({ params }: PageProps) {
  const resolvedParams = await params;
  const dashboardId = resolvedParams["dashboard-id"];

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <DashboardViewer
        dashboardId={dashboardId}
        backHref="/viewer/dashboard"
        backLabel="Dashboards"
        clientTheme
      />
    </div>
  );
}
