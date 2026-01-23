import { DashboardViewer } from "@/components/dashboard/DashboardViewer";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function PublicDashboardPage({ params }: PageProps) {
  const { token } = await params;

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden">
      <DashboardViewer
        dashboardId={token}
        apiEndpoints={{
          etlData: `/api/public/dashboard/${token}/etl-data`,
          aggregateData: `/api/public/dashboard/${token}/aggregate-data`,
          rawData: `/api/public/dashboard/${token}/raw-data`,
          distinctValues: `/api/public/dashboard/${token}/distinct-values`,
        }}
        isPublic={true}
      />
    </div>
  );
}
