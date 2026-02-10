"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AdminDashboardSectionHeader from "./AdminDashboardSectionHeader";
import AdminDashboardSectionFilterBar from "./AdminDashboardFilterBar";
import AdminDashboardStatsGrid from "./AdminDashboardStatsGrid";
import AdminRecentProjects from "./AdminRecentProjects";
import AdminRecentClients from "./AdminRecentClients";
import AdminClientTable from "../clients/AdminClientTable";

import {
  LayoutDashboard,
  Users,
  Workflow,
  Link as LinkIcon,
} from "lucide-react";

// Los dashboards ahora se cargan desde Supabase dentro de DashboardGrid.

interface AdminDashboardSectionProps {
  statsCounts?: {
    dashboards: number;
    clients: number;
    etls: number;
    connections: number;
  };
}

export default function AdminDashboardSection({
  statsCounts,
}: AdminDashboardSectionProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | "activos" | "inactivos">(
    "todos"
  );

  const statsData = [
    {
      id: "dashboards",
      icon: LayoutDashboard, // Icono de Dashboard
      label: "Dashboards totales",
      value: statsCounts?.dashboards || 0,
    },
    {
      id: "clients",
      icon: Users, // Icono de Clientes
      label: "Clientes totales",
      value: statsCounts?.clients || 0,
    },
    {
      id: "etls",
      icon: Workflow, // Icono para ETLs
      label: "ETLs activos",
      value: statsCounts?.etls || 0,
    },
    {
      id: "connections",
      icon: LinkIcon, // Icono para Conexiones
      label: "Conexiones",
      value: statsCounts?.connections || 0,
    },
  ];

  return (
    <div
        className="flex flex-col box-border w-full max-w-[1390px] px-10 py-8 mx-auto rounded-[30px] gap-4 border"
        style={{
          background: "var(--platform-bg-elevated)",
          borderColor: "var(--platform-border)",
        }}
      >
      <AdminDashboardSectionHeader
        title="Panel general"
        subtitle="Crea, edita y gestiona los proyectos de tus clientes."
        buttonText="Nuevo proyecto"
        onButtonClick={() => router.push("/admin/dashboard/new")}
      />
      <AdminDashboardSectionFilterBar
        onSearchChange={() => {}}
        onFilterChange={() => {}}
      />
      <AdminDashboardStatsGrid stats={statsData} />
      <AdminRecentClients />
      <AdminRecentProjects />
      <AdminClientTable />
    </div>
  );
}
