"use client";

import { useState } from "react";
import SearchIcon from "../icons/SearchIcon";

// Definimos los tipos de filtros para tener un código más seguro
type FilterType = "todos" | "publicados" | "borradores";

// Definimos las props para comunicar los cambios al componente padre
interface EtlFilterBarProps {
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: FilterType) => void;
}

export default function EtlFilterBar({
  onSearchChange,
  onFilterChange,
}: EtlFilterBarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("todos");

  const handleFilterClick = (filter: FilterType) => {
    setActiveFilter(filter);
    onFilterChange(filter);
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    onSearchChange(e.target.value);
  };

  // Opciones de filtro para mapear y no repetir código
  const filterOptions: { id: FilterType; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "publicados", label: "Publicados" },
    { id: "borradores", label: "Borradores" },
  ];

  return (
    <div className="flex w-full items-center justify-between gap-5">
      {/* --- Barra de Búsqueda --- */}
      <div className="flex h-[34px] flex-1 items-center gap-2.5 rounded-xl border border-[#D9DCE3] bg-white pr-4">
        <div className="flex h-full items-center self-stretch border-r border-r-[#D9DCE3] px-3">
          <SearchIcon className="h-4 w-4 text-[#9C9EA9]" />
        </div>
        <input
          type="text"
          placeholder="Buscar"
          value={searchQuery}
          onChange={handleSearchInputChange}
          className="w-full bg-transparent text-sm font-normal text-[#555555] placeholder:text-gray-400 focus:outline-none"
        />
      </div>
    </div>
  );
}
