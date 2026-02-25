"use client";

import { useState } from "react";
import { Search, Activity } from "lucide-react";
import MonitorsTable from "@/components/admin/monitors/MonitorsTable";

export default function AdminMonitorsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "started" | "completed" | "failed">("all");

  return (
    <div className="flex w-full flex-col min-h-0">
      {/* Hero: mismo estilo que /admin/dashboard */}
      <section
        className="rounded-3xl border px-6 py-8 sm:px-8 sm:py-10 mb-8"
        style={{
          background: "linear-gradient(135deg, var(--platform-bg-elevated) 0%, var(--platform-surface) 50%)",
          borderColor: "var(--platform-border)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
        }}
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
            >
              <Activity className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--platform-fg)" }}>
                Monitores
              </h1>
              <p className="mt-1 text-sm sm:text-base max-w-xl" style={{ color: "var(--platform-fg-muted)" }}>
                Historial de ejecuciones de ETL y estado del sistema.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Toolbar: búsqueda y filtro por estado */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="relative flex-1 sm:max-w-[320px]">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: "var(--platform-fg-muted)" }} />
          <input
            type="text"
            placeholder="Buscar por ETL o error..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 rounded-xl border pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)] focus:border-transparent transition-shadow"
            style={{
              background: "var(--platform-surface)",
              borderColor: "var(--platform-border)",
              color: "var(--platform-fg)",
            }}
          />
        </div>
        <div
          className="flex items-center gap-1 rounded-xl border p-1"
          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
        >
          {(["all", "completed", "failed", "started"] as const).map((f) => {
            const label = f === "all" ? "Todos" : f === "completed" ? "Exitosos" : f === "failed" ? "Fallidos" : "En curso";
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-all"
                style={{
                  background: filter === f ? "var(--platform-accent)" : "transparent",
                  color: filter === f ? "var(--platform-accent-fg)" : "var(--platform-fg-muted)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabla de Monitores */}
      <MonitorsTable searchQuery={searchQuery} filter={filter} />
    </div>
  );
}
