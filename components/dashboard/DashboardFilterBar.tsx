"use client";

import { useState } from "react";
import SearchIcon from "../icons/SearchIcon";

// Definimos los tipos de filtros para tener un código más seguro
type FilterType = "todos" | "publicados" | "borradores";

// Definimos las props para comunicar los cambios al componente padre
interface DashboardFilterBarProps {
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: FilterType) => void;
  variant?: "light" | "platform";
}

export default function DashboardFilterBar({
  onSearchChange,
  onFilterChange,
  variant = "light",
}: DashboardFilterBarProps) {
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
      <div
        className="flex h-[34px] flex-1 items-center gap-2.5 rounded-xl border pr-4"
        style={
          variant === "platform"
            ? {
                borderColor: "var(--platform-border)",
                background: "var(--platform-surface)",
              }
            : undefined
        }
      >
        <div
          className="flex h-full items-center self-stretch border-r px-3"
          style={
            variant === "platform"
              ? { borderColor: "var(--platform-border)" }
              : undefined
          }
        >
          <SearchIcon
            className={`h-4 w-4 ${
              variant === "platform"
                ? "text-[var(--platform-fg-muted)]"
                : "text-[#9C9EA9]"
            }`}
          />
        </div>
        <input
          type="text"
          placeholder="Buscar"
          value={searchQuery}
          onChange={handleSearchInputChange}
          className={`w-full bg-transparent text-sm font-normal focus:outline-none ${
            variant === "platform"
              ? "text-[var(--platform-fg)] placeholder:text-[var(--platform-muted)]"
              : "text-[#555555] placeholder:text-gray-400"
          }`}
        />
      </div>

      {/* --- Botones de Filtro --- */}
      <div className="flex items-center gap-4">
        {filterOptions.map((option) => {
          const isActive = activeFilter === option.id;

          const baseClasses =
            "flex h-[30px] cursor-pointer items-center justify-center rounded-full px-4 py-2 text-[13px] font-medium leading-4 transition-all duration-200";
          const activeClasses =
            variant === "platform"
              ? "bg-[var(--platform-accent)] text-[var(--platform-accent-fg)] shadow-[0_0_0_1px_var(--platform-accent)]"
              : "bg-[#474747] text-white shadow-[5px_5px_15px_rgba(155,166,228,0.25)]";
          const inactiveClasses =
            variant === "platform"
              ? "border border-[var(--platform-border)] text-[var(--platform-fg-muted)] hover:bg-[var(--platform-surface-hover)]"
              : "border border-[#232323] text-[#232323] hover:bg-gray-100";

          return (
            <button
              key={option.id}
              onClick={() => handleFilterClick(option.id)}
              className={`${baseClasses} ${
                isActive ? activeClasses : inactiveClasses
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
