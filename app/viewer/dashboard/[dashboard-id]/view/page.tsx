import DashboardViewer from "@/components/dashboard/DashboardViewer";

// 1. Se define el tipo de Props, con 'params' siendo una Promise.
type PageProps = {
  params: Promise<{ "dashboard-id": string }>;
};

// 2. Se marca el componente como async para poder usar await.
export default async function Page({ params }: PageProps) {
  // 3. Se usa await para resolver la Promise de params.
  const resolvedParams = await params;
  const dashboardId = resolvedParams["dashboard-id"];

  return <DashboardViewer dashboardId={dashboardId} />;
}
