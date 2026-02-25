
"use client";
import { useState, useCallback } from "react";
import AdminEtlGrid from "@/components/admin/AdminEtlGrid";
import { Search, Plus, RefreshCw, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateEtlDialog } from "./CreateEtlDialog";
import { ClientFilter } from "@/components/admin/dashboard/ClientFilter";

export default function AdminEtlPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const filter = "todos" as const;
  const [clientId, setClientId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleNewEtl = () => {
    setShowCreateModal(true);
  };

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="flex w-full flex-col min-h-0">
      <CreateEtlDialog open={showCreateModal} onOpenChange={setShowCreateModal} />

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
              <Workflow className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--platform-fg)" }}>
                ETLs
              </h1>
              <p className="mt-1 text-sm sm:text-base max-w-xl" style={{ color: "var(--platform-fg-muted)" }}>
                Vista global de todos los ETLs de la plataforma. Creá flujos de datos, conectá fuentes y generá métricas para dashboards.
              </p>
            </div>
          </div>
          <Button
            onClick={handleNewEtl}
            className="shrink-0 rounded-xl font-semibold gap-2 h-12 px-6 shadow-lg hover:shadow-xl transition-all"
            style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
          >
            <Plus className="h-5 w-5" />
            Crear ETL
          </Button>
        </div>
      </section>

      {/* Toolbar: búsqueda, filtro cliente, refrescar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="relative flex-1 sm:max-w-[320px]">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: "var(--platform-fg-muted)" }} />
            <input
              type="text"
              placeholder="Buscar por título o descripción..."
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
          <ClientFilter onSelect={(id) => setClientId(id)} />
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          className="flex items-center gap-2 rounded-xl px-4 h-11 shrink-0"
          style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}
          title="Refrescar lista"
        >
          <RefreshCw className="h-4 w-4" />
          Refrescar
        </Button>
      </div>

      {/* Grid de ETLs */}
      <AdminEtlGrid key={refreshKey} searchQuery={searchQuery} filter={filter} clientId={clientId ?? ""} />
    </div>
  );
}
