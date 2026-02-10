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
          <h1 className="text-[32px] font-semibold leading-[48px]" style={{ color: "var(--platform-fg)" }}>
            Monitores (Admin)
          </h1>
          <p className="text-base font-normal leading-6" style={{ color: "var(--platform-fg-muted)" }}>
            Historial de ejecuciones de ETL y estado del sistema.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: "var(--platform-fg-muted)" }} />
            <input
              type="text"
              placeholder="Buscar por ETL o error..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-[42px] w-full rounded-full border pl-10 pr-4 text-sm focus:outline-none focus:ring-2 sm:w-[320px]"
              style={{
                background: "var(--platform-surface)",
                borderColor: "var(--platform-border)",
                color: "var(--platform-fg)",
              }}
            />
          </div>

          <div
            className="flex items-center gap-2 rounded-full border p-1"
            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
          >
            {(["all", "completed", "failed", "started"] as const).map((f) => {
              const label = f === "all" ? "Todos" : f === "completed" ? "Exitosos" : f === "failed" ? "Fallidos" : "En curso";
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    background: filter === f ? "var(--platform-accent)" : "transparent",
                    color: filter === f ? "#08080b" : "var(--platform-fg-muted)",
                  }}
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
