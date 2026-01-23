"use client";

import { useState } from "react";
import AdminConnectionsGrid from "@/components/admin/AdminConnectionsGrid";
import { Search, Plus } from "lucide-react";
import AdminNewConnectionDialog from "@/components/admin/AdminNewConnectionDialog";
import { createClient } from "@/lib/supabase/client";

export default function AdminConnectionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

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
    <div className="flex w-full flex-col gap-8 p-8">
      {/* Header de la sección */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-poppins text-[32px] font-semibold leading-[48px] text-[#00030A]">
            Conexiones (Admin)
          </h1>
          <p className="font-inter text-base font-normal leading-6 text-[#54565B]">
            Vista global de todas las conexiones de la plataforma.
          </p>
        </div>

        {/* Barra de búsqueda y botón */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-[42px] w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 text-sm text-gray-600 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-[280px]"
            />
          </div>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-black text-white hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      <AdminNewConnectionDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={() => {
          window.location.reload();
        }}
      />

      {/* Grid de Conexiones */}
      <AdminConnectionsGrid searchQuery={searchQuery} onDelete={handleDelete} />
    </div>
  );
}
