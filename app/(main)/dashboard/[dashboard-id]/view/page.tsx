// @/app/.../[dashboard-id]/page.tsx

import DashboardViewer from "@/components/dashboard/DashboardViewer";

// 1. Defino el tipo de Props exactamente como lo pides,
//    con 'params' siendo una Promise.
type PageProps = {
  params: Promise<{ "dashboard-id": string }>;
};

// 2. Marco el componente como async para poder usar await.
export default async function Page({ params }: PageProps) {
  // 3. Uso await para resolver la Promise de params, como indicaste.
  const resolvedParams = await params;
  const dashboardId = resolvedParams["dashboard-id"];

  return <DashboardViewer dashboardId={dashboardId} />;
}
