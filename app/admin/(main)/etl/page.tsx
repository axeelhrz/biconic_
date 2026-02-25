
"use client";
import { useState, useCallback } from "react";
import AdminEtlGrid from "@/components/admin/AdminEtlGrid";
import { Search, Plus, RefreshCw } from "lucide-react";
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
    <div className="flex w-full flex-col gap-8 p-8">
      <CreateEtlDialog open={showCreateModal} onOpenChange={setShowCreateModal} />

      {/* Header de la sección */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[32px] font-semibold leading-[48px]" style={{ color: "var(--platform-fg)" }}>
            ETLs (Admin)
          </h1>
          <p className="text-base font-normal leading-6" style={{ color: "var(--platform-fg-muted)" }}>
            Vista global de todos los ETLs de la plataforma.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="relative flex-1 sm:max-w-[320px]">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: "var(--platform-fg-muted)" }} />
            <input
              type="text"
              placeholder="Buscar por título o descripción..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 rounded-xl border pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)] focus:border-transparent transition-shadow sm:w-[280px]"
              style={{
                background: "var(--platform-surface)",
                borderColor: "var(--platform-border)",
                color: "var(--platform-fg)",
              }}
            />
          </div>

          <ClientFilter onSelect={(id) => setClientId(id)} />

          <Button
            variant="outline"
            onClick={handleRefresh}
            className="flex items-center gap-2 rounded-xl px-4 h-11"
            style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}
            title="Refrescar lista"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Refrescar</span>
          </Button>
          <Button
            onClick={handleNewEtl}
            className="flex items-center gap-2 rounded-xl px-6 h-11 font-medium hover:opacity-90"
            style={{ color: "var(--platform-accent-fg)", background: "var(--platform-accent)" }}
          >
            <Plus className="h-5 w-5" />
            <span>Crear ETL</span>
          </Button>
        </div>
      </div>

      {/* Grid de ETLs */}
      <AdminEtlGrid key={refreshKey} searchQuery={searchQuery} filter={filter} clientId={clientId ?? ""} />
    </div>
  );
}
