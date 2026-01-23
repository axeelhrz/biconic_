
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
          <h1 className="font-poppins text-[32px] font-semibold leading-[48px] text-[#00030A]">
            ETLs (Admin)
          </h1>
          <p className="font-inter text-base font-normal leading-6 text-[#54565B]">
            Vista global de todos los ETLs de la plataforma.
          </p>
        </div>

        {/* Barra de búsqueda y filtros */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Input de Búsqueda */}
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

          {/* Filtros */}
          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white p-1">
            {(["todos", "publicados", "borradores"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  filter === f
                    ? "bg-[#F4F6FA] text-black"
                    : "text-gray-500 hover:text-black"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Botón Crear */}
          <Button
            onClick={handleNewEtl}
            className="flex items-center gap-2 rounded-full bg-[#0F5F4C] px-6 text-white hover:bg-[#0b4638]"
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
