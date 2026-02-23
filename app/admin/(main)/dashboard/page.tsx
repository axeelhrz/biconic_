"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import AdminDashboardGrid from "@/components/admin/AdminDashboardGrid";
import { Search, Plus, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateDashboardDialog } from "./CreateDashboardDialog";
import { ClientFilter } from "@/components/admin/dashboard/ClientFilter";

function AdminDashboardContent() {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"todos" | "publicados" | "borradores">("todos");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [initialEtlId, setInitialEtlId] = useState<string | null>(null);

  useEffect(() => {
    const create = searchParams.get("create");
    const etlId = searchParams.get("etlId");
    if (create === "1" && etlId) {
      setShowCreateModal(true);
      setInitialEtlId(etlId);
    }
  }, [searchParams]);

  return (
    <div className="flex w-full flex-col min-h-0">
      <CreateDashboardDialog
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        initialEtlId={initialEtlId}
      />

      {/* Hero */}
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
              <LayoutDashboard className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--platform-fg)" }}>
                Dashboards
              </h1>
              <p className="mt-1 text-sm sm:text-base max-w-xl" style={{ color: "var(--platform-fg-muted)" }}>
                Creá y gestioná tableros por cliente. Conectá fuentes de datos (ETLs) y construí reportes con branding propio.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            className="shrink-0 rounded-xl font-semibold gap-2 h-12 px-6 shadow-lg hover:shadow-xl transition-all"
            style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
          >
            <Plus className="h-5 w-5" />
            Crear dashboard
          </Button>
        </div>
      </section>

      {/* Toolbar: búsqueda, filtro cliente, estado */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="relative flex-1 sm:max-w-[320px]">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: "var(--platform-fg-muted)" }} />
            <input
              type="text"
              placeholder="Buscar por nombre..."
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
          <ClientFilter onSelect={setSelectedClientId} />
        </div>
        <div
          className="flex items-center gap-1 rounded-xl border p-1"
          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
        >
          {(["todos", "publicados", "borradores"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-all"
              style={{
                background: filter === f ? "var(--platform-accent)" : "transparent",
                color: filter === f ? "var(--platform-accent-fg)" : "var(--platform-fg-muted)",
              }}
            >
              {f === "todos" ? "Todos" : f === "publicados" ? "Publicados" : "Borradores"}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <AdminDashboardGrid
        searchQuery={searchQuery}
        filter={filter}
        clientId={selectedClientId}
        basePath="/admin/dashboard"
      />
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex w-full flex-col gap-8 p-6">
          <div className="h-32 rounded-3xl animate-pulse" style={{ background: "var(--platform-surface-hover)" }} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-[220px] rounded-2xl animate-pulse border"
                style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}
              />
            ))}
          </div>
        </div>
      }
    >
      <AdminDashboardContent />
    </Suspense>
  );
}
