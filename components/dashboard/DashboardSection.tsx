"use client";
import { useState } from "react";
import { useUser } from "@/hooks/useUser";
import { useRouter } from "next/navigation";
import DashboardSectionHeader from "./DashboardSectionHeader";
import DashboardFilterBar from "./DashboardFilterBar";
import DashboardStatsGrid from "./DashboardStatsGrid";
import PencilSquareIcon from "../icons/PencilSquareIcon";
import CheckCircleIcon from "../icons/CheckCircleIcon";
import ListBulletIcon from "../icons/ListBulletIcon";
import InformationCircleIcon from "../icons/InformationCircleIcon";
import DashboardGrid from "./DashboardGrid";
import NewDashboardDialog from "./NewDashboardDialog";

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

// Los dashboards ahora se cargan desde Supabase dentro de DashboardGrid.

export default function DashboardsSection() {
  const { role } = useUser();
  const canCreate = role === "CREATOR" || role === "APP_ADMIN";
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "todos" | "publicados" | "borradores"
  >("todos");
  const router = useRouter();

  const generateUUIDv4 = () => {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    // Fallback RFC4122 v4
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  };

  // This function is no longer needed as we use the dialog
  const handleNewDashboard = async () => {
    // This is kept for backward compatibility but won't be used
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    console.log("Buscando:", query);
    // Aquí iría la lógica para filtrar los datos mostrados
  };

  const handleFilter = (filter: "todos" | "publicados" | "borradores") => {
    setActiveFilter(filter);
    console.log("Filtrando por:", filter);
    // Aquí iría la lógica para filtrar los datos mostrados
  };

  return (
    <div className="flex flex-col box-border w-full max-w-[1390px] px-10 py-8 mx-auto bg-[#FDFDFD] border border-[#ECECEC] rounded-[30px] gap-4">
      <DashboardSectionHeader
        title="Dashboards"
        subtitle="Gestiona y edita tus dashboards"
        buttonText="Nuevo Dashboard"
        showButton={canCreate}
        buttonComponent={
          canCreate ? (
            <NewDashboardDialog>
              <button className="flex h-10 items-center justify-center gap-2 rounded-full bg-[#0F5F4C] py-2 pl-5 pr-4 text-white transition-opacity hover:opacity-90">
                <span className="text-[15px] font-medium leading-5">
                  Nuevo Dashboard
                </span>
              </button>
            </NewDashboardDialog>
          ) : undefined
        }
      />

      <DashboardFilterBar
        onSearchChange={handleSearch}
        onFilterChange={handleFilter}
      />

      <DashboardStatsGrid stats={statsData} />

      <DashboardGrid searchQuery={searchQuery} filter={activeFilter} />

      {/* ... Aquí irán los siguientes componentes que construiremos ... */}
    </div>
  );
}
