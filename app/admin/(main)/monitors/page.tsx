"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import MonitorsTable from "@/components/admin/monitors/MonitorsTable";

export default function AdminMonitorsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "started" | "completed" | "failed">("all");

  return (
    <div className="flex w-full flex-col gap-8 p-8">
      {/* Header de la sección */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-poppins text-[32px] font-semibold leading-[48px] text-[#00030A]">
            Monitores (Admin)
          </h1>
          <p className="font-inter text-base font-normal leading-6 text-[#54565B]">
            Historial de ejecuciones de ETL y estado del sistema.
          </p>
        </div>

        {/* Barra de búsqueda y filtros */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Input de Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por ETL o error..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-[42px] w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 text-sm text-gray-600 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-[320px]"
            />
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white p-1">
            {(["all", "completed", "failed", "started"] as const).map((f) => {
               const label = f === "all" ? "Todos" : f === "completed" ? "Exitosos" : f === "failed" ? "Fallidos" : "En curso";
               return (
                <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    filter === f
                        ? "bg-[#F4F6FA] text-black"
                        : "text-gray-500 hover:text-black"
                    }`}
                >
                    {label}
                </button>
               );
            })}
          </div>
        </div>
      </div>

      {/* Tabla de Monitores */}
      <MonitorsTable searchQuery={searchQuery} filter={filter} />
    </div>
  );
}
