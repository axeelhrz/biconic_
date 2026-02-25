"use client";

import { useState } from "react";
import AdminConnectionsGrid from "@/components/admin/AdminConnectionsGrid";
import { Search, Plus, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdminNewConnectionDialog from "@/components/admin/AdminNewConnectionDialog";
import ConnectionConfigDialog from "@/components/admin/ConnectionConfigDialog";
import ConnectionTablesDialog from "@/components/connections/ConnectionTablesDialog";
import DeleteConnectionDialog from "@/components/connections/DeleteConnectionDialog";

export default function AdminConnectionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [configDialogConnectionId, setConfigDialogConnectionId] = useState<string | null>(null);
  const [configDialogMode, setConfigDialogMode] = useState<"view" | "edit">("edit");
  const [tablesDialogOpen, setTablesDialogOpen] = useState(false);
  const [tablesDialogConnectionId, setTablesDialogConnectionId] = useState<string | null>(null);
  const [tablesDialogTitle, setTablesDialogTitle] = useState("");
  const [tablesDialogType, setTablesDialogType] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteTitle, setDeleteTitle] = useState<string | null>(null);

  const openDeleteConfirm = (id: string, title?: string) => {
    setDeleteId(id);
    setDeleteTitle(title ?? null);
    setDeleteOpen(true);
  };

  return (
    <div className="flex w-full flex-col min-h-0">
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
        mode={configDialogMode}
        onSaved={() => {
          setConfigDialogConnectionId(null);
          window.location.reload();
        }}
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

      <DeleteConnectionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        connectionId={deleteId}
        connectionTitle={deleteTitle}
        onDeleted={() => {
          setDeleteOpen(false);
          setDeleteId(null);
          setDeleteTitle(null);
          window.location.reload();
        }}
      />

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
              <Database className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--platform-fg)" }}>
                Conexiones
              </h1>
              <p className="mt-1 text-sm sm:text-base max-w-xl" style={{ color: "var(--platform-fg-muted)" }}>
                Vista global de todas las conexiones de la plataforma. Creá y configurá bases de datos, Excel y más.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="shrink-0 rounded-xl font-semibold gap-2 h-12 px-6 shadow-lg hover:shadow-xl transition-all"
            style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
          >
            <Plus className="h-5 w-5" />
            Nueva conexión
          </Button>
        </div>
      </section>

      {/* Toolbar: búsqueda */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="relative flex-1 sm:max-w-[320px]">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: "var(--platform-fg-muted)" }} />
          <input
            type="text"
            placeholder="Buscar por nombre, host o base..."
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
      </div>

      {/* Grid de Conexiones */}
      <AdminConnectionsGrid
        searchQuery={searchQuery}
        onConfigure={(id) => {
          setConfigDialogMode("edit");
          setConfigDialogConnectionId(id);
        }}
        onPreview={(id) => {
          setConfigDialogMode("view");
          setConfigDialogConnectionId(id);
        }}
        onDelete={openDeleteConfirm}
      />
    </div>
  );
}
