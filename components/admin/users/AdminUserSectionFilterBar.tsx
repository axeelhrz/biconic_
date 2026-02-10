"use client";

import { useState } from "react";
import SearchIcon from "../../icons/SearchIcon";

// Definimos los tipos de filtros para tener un código más seguro
type FilterType = "todos" | "activos" | "inactivos";

// Definimos las props para comunicar los cambios al componente padre
interface AdminUserSectionFilterBarProps {
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: FilterType) => void;
}

export default function AdminUserSectionFilterBar({
  onSearchChange,
  onFilterChange,
}: AdminUserSectionFilterBarProps) {
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
    { id: "activos", label: "Activos" },
    { id: "inactivos", label: "Inactivos" },
  ];

  return (
    <div className="flex w-full items-center justify-between gap-5">
      <div className="flex items-center gap-4">
        {filterOptions.map((option) => {
          const isActive = activeFilter === option.id;
          return (
            <button
              key={option.id}
              onClick={() => handleFilterClick(option.id)}
              className="flex h-[30px] cursor-pointer items-center justify-center rounded-full px-4 py-2 text-[13px] font-medium leading-4 transition-all duration-200"
              style={{
                background: isActive ? "var(--platform-accent)" : "transparent",
                color: isActive ? "#08080b" : "var(--platform-fg-muted)",
                border: `1px solid ${isActive ? "var(--platform-accent)" : "var(--platform-border)"}`,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div
        className="flex h-[34px] flex-1 items-center gap-2.5 rounded-xl border pr-4"
        style={{
          borderColor: "var(--platform-border)",
          background: "var(--platform-surface)",
        }}
      >
        <div
          className="flex h-full items-center self-stretch border-r px-3"
          style={{ borderColor: "var(--platform-border)" }}
        >
          <SearchIcon className="h-4 w-4" style={{ color: "var(--platform-fg-muted)" }} />
        </div>
        <input
          type="text"
          placeholder="Buscar"
          value={searchQuery}
          onChange={handleSearchInputChange}
          className="w-full bg-transparent text-sm font-normal focus:outline-none"
          style={{ color: "var(--platform-fg)" }}
        />
      </div>
    </div>
  );
}
