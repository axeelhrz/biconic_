"use client";
import { useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import DashboardSectionHeader from "@/components/dashboard/DashboardSectionHeader";
import DashboardFilterBar from "@/components/dashboard/DashboardFilterBar";
import DashboardStatsGrid from "@/components/dashboard/DashboardStatsGrid";
import ViewerDashboardGrid from "@/components/viewer/dashboard/ViewerDashboardGrid";
import CheckCircleIcon from "@/components/icons/CheckCircleIcon";
import PencilSquareIcon from "@/components/icons/PencilSquareIcon";
import ListBulletIcon from "@/components/icons/ListBulletIcon";
import InformationCircleIcon from "@/components/icons/InformationCircleIcon";

const statsData = [
  { id: "total", icon: ListBulletIcon, label: "Dashboards totales", value: 6 },
  { id: "published", icon: CheckCircleIcon, label: "Publicados", value: 3 },
  {
    id: "avg-views",
    icon: PencilSquareIcon,
    label: "Vistas promedio",
    value: 518,
  },
  {
    id: "avg-widgets",
    icon: InformationCircleIcon,
    label: "Widgets promedio",
    value: 7,
  },
];

export default function ViewerDashboardsSection() {
  const { role } = useUserRole();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "todos" | "publicados" | "borradores"
  >("todos");

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };
  const handleFilter = (filter: "todos" | "publicados" | "borradores") => {
    setActiveFilter(filter);
  };

  return (
    <div className="flex flex-col box-border w-full max-w-[1390px] px-10 py-8 mx-auto bg-[#FDFDFD] border border-[#ECECEC] rounded-[30px] gap-4">
      <DashboardSectionHeader
        title="Dashboards"
        subtitle={`Modo visualización (rol: ${role ?? "desconocido"})`}
        buttonText="Nuevo Dashboard"
        showButton={false}
      />
      <DashboardFilterBar
        onSearchChange={handleSearch}
        onFilterChange={handleFilter}
      />
      <DashboardStatsGrid stats={statsData} />
      <ViewerDashboardGrid searchQuery={searchQuery} filter={activeFilter} />
    </div>
  );
}
