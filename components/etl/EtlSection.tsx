"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PencilSquareIcon from "../icons/PencilSquareIcon";
import CheckCircleIcon from "../icons/CheckCircleIcon";
import ListBulletIcon from "../icons/ListBulletIcon";
import InformationCircleIcon from "../icons/InformationCircleIcon";
import EtlSectionHeader from "./EtlSectionHeader";
import EtlFilterBar from "./EtlFilterBar";
import EtlStatsGrid from "./EtlStatsGrid";
import EtlGrid from "./EtlGrid";
import { useUser } from "@/hooks/useUser";

const statsData = [
  { id: "total", icon: ListBulletIcon, label: "Total de conexiones", value: 4 },
  { id: "active-etl", icon: CheckCircleIcon, label: "Etl activos", value: 8 },
  {
    id: "draws",
    icon: PencilSquareIcon,
    label: "Borradores",
    value: 8,
  },
  {
    id: "errores",
    icon: InformationCircleIcon,
    label: "Con errores",
    value: 8,
  },
];

// Los dashboards ahora se cargan desde Supabase dentro de DashboardGrid.

export default function EtlSection() {
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

  const handleNewDashboard = () => {
    const newId = generateUUIDv4();
    // Redirige al editor de ETL con un id nuevo; la página de [etl-id] permite crear si no existe
    router.push(`/etl/${newId}`);
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
      <EtlSectionHeader
        title="Gestor de ETL"
        subtitle="Configura y gestiona las conexiones a tus Bases de datos"
        buttonText="Nuevo ETL"
        onButtonClick={handleNewDashboard}
        showButton={canCreate}
      />
      <EtlFilterBar
        onSearchChange={handleSearch}
        onFilterChange={handleFilter}
      />
      <EtlStatsGrid stats={statsData} />
      <EtlGrid />
    </div>
  );
}
