"use client";
import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import AdminDashboardGrid from "@/components/admin/AdminDashboardGrid";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateDashboardDialog } from "./CreateDashboardDialog";
import { ClientFilter } from "@/components/admin/dashboard/ClientFilter";

function AdminDashboardContent() {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"todos" | "publicados" | "borradores">(
    "todos"
  );
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
    <div className="flex w-full flex-col gap-8 p-8">
      <CreateDashboardDialog
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        initialEtlId={initialEtlId}
      />

      {/* Header de la sección */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[32px] font-semibold leading-[48px]" style={{ color: "var(--platform-fg)" }}>
            Dashboards (Admin)
          </h1>
          <p className="text-base font-normal leading-6" style={{ color: "var(--platform-fg-muted)" }}>
            Vista global de todos los tableros de la plataforma.
          </p>
        </div>

        {/* Barra de búsqueda y filtros */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Input de Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: "var(--platform-fg-muted)" }} />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-[42px] w-full rounded-full border pl-10 pr-4 text-sm focus:outline-none focus:ring-2 sm:w-[280px]"
              style={{
                background: "var(--platform-surface)",
                borderColor: "var(--platform-border)",
                color: "var(--platform-fg)",
              }}
            />
          </div>

          {/* Filtro Cliente */}
          <ClientFilter onSelect={setSelectedClientId} />

          {/* Filtros Estado */}
          <div
            className="hidden lg:flex items-center gap-2 rounded-full border p-1"
            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
          >
            {(["todos", "publicados", "borradores"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
                style={{
                  background: filter === f ? "var(--platform-accent)" : "transparent",
                  color: filter === f ? "#08080b" : "var(--platform-fg-muted)",
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Botón Crear */}
          <Button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-full px-6 text-[#08080b] font-medium hover:opacity-90"
            style={{ background: "var(--platform-accent)" }}
          >
            <Plus className="h-5 w-5" />
            <span className="hidden xl:inline">Crear Dashboard</span>
            <span className="xl:hidden">Crear</span>
          </Button>
        </div>
      </div>

      {/* Grid de Dashboards */}
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
        <div className="flex w-full flex-col gap-8 p-8">
          <div className="h-10 w-48 animate-pulse rounded bg-[var(--platform-surface-hover)]" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[200px] animate-pulse rounded-xl border"
                style={{
                  background: "var(--platform-surface)",
                  borderColor: "var(--platform-border)",
                }}
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
