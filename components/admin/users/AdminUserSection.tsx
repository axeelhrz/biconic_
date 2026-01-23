"use client";
import { useRouter } from "next/navigation";
import AdminUserSectionHeader from "./AdminUserSectionHeader";
import AdminUserSectionFilterBar from "./AdminUserSectionFilterBar";
import { useState } from "react";
import AdminUserTable from "./AdminUserTable";

// Los dashboards ahora se cargan desde Supabase dentro de DashboardGrid.

export default function AdminUserSection() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | "activos" | "inactivos">(
    "todos"
  );

  return (
    <div className="flex flex-col box-border w-full max-w-[1390px] px-10 py-8 mx-auto bg-[#FDFDFD] border border-[#ECECEC] rounded-[30px] gap-4">
      <AdminUserSectionHeader
        title="Gestión de Usuarios"
        subtitle="Administra los usuarios de la plataforma"
        buttonText="Agregar Usuario"
        onButtonClick={() => router.push("/admin/users/new")}
      />
      <AdminUserSectionFilterBar
        onSearchChange={setSearch}
        onFilterChange={setFilter}
      />
      <AdminUserTable search={search} filter={filter} />
    </div>
  );
}
