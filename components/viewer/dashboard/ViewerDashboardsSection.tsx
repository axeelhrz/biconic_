"use client";
import { useMemo, useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { useViewerAccessibleDashboards } from "@/hooks/useViewerAccessibleDashboards";
import DashboardSectionHeader from "@/components/dashboard/DashboardSectionHeader";
import DashboardFilterBar from "@/components/dashboard/DashboardFilterBar";
import DashboardStatsGrid from "@/components/dashboard/DashboardStatsGrid";
import ViewerDashboardGrid from "@/components/viewer/dashboard/ViewerDashboardGrid";
import CheckCircleIcon from "@/components/icons/CheckCircleIcon";
import PencilSquareIcon from "@/components/icons/PencilSquareIcon";
import ListBulletIcon from "@/components/icons/ListBulletIcon";
import InformationCircleIcon from "@/components/icons/InformationCircleIcon";

function appRoleLabel(appRole: string | null): string {
  if (appRole === "VIEWER") return "Usuario";
  if (appRole === "CREATOR") return "Creador";
  if (appRole === "APP_ADMIN") return "Administrador";
  return appRole ?? "desconocido";
}

export default function ViewerDashboardsSection() {
  const { role } = useUserRole();
  const {
    dashboards,
    loading,
    error,
    publishedCount,
    draftCount,
    totalCount,
  } = useViewerAccessibleDashboards();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "todos" | "publicados" | "borradores"
  >("todos");

  const totalViews = useMemo(
    () => dashboards.reduce((sum, d) => sum + (d.views ?? 0), 0),
    [dashboards]
  );
  const avgViews =
    totalCount > 0 ? Math.round(totalViews / totalCount) : 0;

  const statsForGrid = useMemo(
    () => [
      {
        id: "total",
        icon: ListBulletIcon,
        label: "Dashboards totales",
        value: totalCount,
      },
      {
        id: "published",
        icon: CheckCircleIcon,
        label: "Publicados",
        value: publishedCount,
      },
      {
        id: "drafts",
        icon: InformationCircleIcon,
        label: "Borradores",
        value: draftCount,
      },
      {
        id: "avg-views",
        icon: PencilSquareIcon,
        label: "Vistas promedio",
        value: avgViews,
      },
    ],
    [totalCount, publishedCount, draftCount, avgViews]
  );

  return (
    <div className="flex flex-col box-border w-full max-w-[1390px] px-10 py-8 mx-auto bg-[#FDFDFD] border border-[#ECECEC] rounded-[30px] gap-4">
      <DashboardSectionHeader
        title="Dashboards"
        subtitle={`Modo visualización · ${appRoleLabel(role)}`}
        buttonText="Nuevo Dashboard"
        showButton={false}
      />
      <DashboardFilterBar
        onSearchChange={setSearchQuery}
        onFilterChange={setActiveFilter}
      />
      {!loading && !error ? (
        <DashboardStatsGrid stats={statsForGrid} />
      ) : null}
      <ViewerDashboardGrid
        dashboards={dashboards}
        loading={loading}
        error={error}
        searchQuery={searchQuery}
        filter={activeFilter}
      />
    </div>
  );
}
