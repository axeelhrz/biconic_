
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminEtlGrid from "@/components/admin/AdminEtlGrid";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateEtlDialog } from "./CreateEtlDialog";

export default function AdminEtlPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"todos" | "publicados" | "borradores">(
    "todos"
  );
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleNewEtl = () => {
    setShowCreateModal(true);
  };

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

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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

          <div
            className="flex items-center gap-2 rounded-full border p-1"
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

          <Button
            onClick={handleNewEtl}
            className="flex items-center gap-2 rounded-full px-6 text-[#08080b] font-medium hover:opacity-90"
            style={{ background: "var(--platform-accent)" }}
          >
            <Plus className="h-5 w-5" />
            <span>Crear ETL</span>
          </Button>
        </div>
      </div>

      {/* Grid de ETLs */}
      <AdminEtlGrid searchQuery={searchQuery} filter={filter} />
    </div>
  );
}
