"use client";

import { useState } from "react";
import AdminConnectionsGrid from "@/components/admin/AdminConnectionsGrid";
import { Search, Plus } from "lucide-react";
import AdminNewConnectionDialog from "@/components/admin/AdminNewConnectionDialog";
import ConnectionConfigDialog from "@/components/admin/ConnectionConfigDialog";
import ConnectionTablesDialog from "@/components/connections/ConnectionTablesDialog";
import { createClient } from "@/lib/supabase/client";

export default function AdminConnectionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [configDialogConnectionId, setConfigDialogConnectionId] = useState<string | null>(null);
  const [tablesDialogOpen, setTablesDialogOpen] = useState(false);
  const [tablesDialogConnectionId, setTablesDialogConnectionId] = useState<string | null>(null);
  const [tablesDialogTitle, setTablesDialogTitle] = useState("");
  const [tablesDialogType, setTablesDialogType] = useState("");

  const handleDelete = async (id: string, title?: string) => {
    if (
      !confirm(
        `¿Estás seguro de que deseas eliminar la conexión "${
          title || "Sin título"
        }"?`
      )
    ) {
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error eliminando conexión:", error);
        alert("Error al eliminar la conexión: " + error.message);
        return;
      }

      window.location.reload();
    } catch (err) {
      console.error("Error inesperado:", err);
      alert("Ocurrió un error inesperado al eliminar.");
    }
  };

  return (
    <div className="flex w-full flex-col gap-8">
      {/* Contenedor elevado tipo card */}
      <div
        className="rounded-2xl border p-6 sm:p-8"
        style={{
          background: "var(--platform-bg-elevated)",
          borderColor: "var(--platform-border)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header con línea de acento */}
        <div className="mb-8">
          <div
            className="mb-3 h-1 w-12 rounded-full"
            style={{ background: "var(--platform-gradient)" }}
          />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1
                className="text-2xl font-semibold tracking-tight sm:text-3xl"
                style={{ color: "var(--platform-fg)" }}
              >
                Conexiones
              </h1>
              <p
                className="mt-1 text-sm sm:text-base"
                style={{ color: "var(--platform-fg-muted)" }}
              >
                Vista global de todas las conexiones de la plataforma. Creá y configurá bases de datos, Excel y más.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <Search
                  className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: "var(--platform-muted)" }}
                />
                <input
                  type="text"
                  placeholder="Buscar por nombre, host o base..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11 w-full rounded-xl border pl-10 pr-4 text-sm transition-colors placeholder:opacity-70 focus:outline-none focus:ring-2 sm:w-[300px]"
                  style={{
                    background: "var(--platform-surface)",
                    borderColor: "var(--platform-border)",
                    color: "var(--platform-fg)",
                  }}
                />
              </div>

              <button
                onClick={() => setIsCreateOpen(true)}
                className="flex h-11 items-center justify-center gap-2 rounded-xl px-5 font-medium transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)]/50"
                style={{
                  background: "var(--platform-accent)",
                  color: "var(--platform-accent-fg)",
                }}
              >
                <Plus className="h-5 w-5" />
                <span>Nueva conexión</span>
              </button>
            </div>
          </div>
        </div>

      <AdminNewConnectionDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={() => {
          window.location.reload();
        }}
      />

      <ConnectionConfigDialog
        open={!!configDialogConnectionId}
        onOpenChange={(open) => !open && setConfigDialogConnectionId(null)}
        connectionId={configDialogConnectionId}
        onOpenTables={(id, title, type) => {
          setConfigDialogConnectionId(null);
          setTablesDialogConnectionId(id);
          setTablesDialogTitle(title);
          setTablesDialogType(type);
          setTablesDialogOpen(true);
        }}
      />

      <ConnectionTablesDialog
        open={tablesDialogOpen}
        onOpenChange={setTablesDialogOpen}
        connectionId={tablesDialogConnectionId}
        connectionTitle={tablesDialogTitle}
        connectionType={tablesDialogType}
        onSaved={() => {
          setTablesDialogOpen(false);
          window.location.reload();
        }}
      />

        {/* Grid de Conexiones */}
        <AdminConnectionsGrid
          searchQuery={searchQuery}
          onConfigure={(id) => setConfigDialogConnectionId(id)}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
