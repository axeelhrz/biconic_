"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Plus, Search } from "lucide-react";
import ClientProjectsGrid, {
  type ProjectFilter,
} from "@/components/admin/clients/ClientProjectsGrid";
import { cn } from "@/lib/utils";
import ClientPermissionsPanel from "@/components/admin/clients/ClientPermissionsPanel";
import ClientUsersPanel from "@/components/admin/clients/ClientUsersPanel";

export default function ClientProjectsShell({
  clientId,
  clientName,
  membersCount,
}: {
  clientId: string;
  clientName: string;
  membersCount: number;
}) {
  const [filter, setFilter] = useState<ProjectFilter>("todos");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"projects" | "permissions" | "users">("projects");

  return (
    <div className="flex w-full max-w-[1390px] flex-col gap-5 rounded-[30px] border border-[#ECECEC] bg-[#FDFDFD] px-10 py-8">
      {/* Back button */}
      <div>
        <Link
          href="/admin/clients"
          className="inline-flex h-[30px] items-center justify-center gap-2 rounded-full px-3 text-[13px] font-medium text-[#047183]"
        >
          <ArrowLeft className="h-4 w-4 text-[#016573]" />
          Volver al listado de clientes
        </Link>
      </div>

      {/* Header with avatar/name and CTA */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-[50px] w-[50px] rounded-full bg-white shadow-[0px_4px_24px_rgba(109,141,173,0.15)] ring-1 ring-gray-100 flex items-center justify-center text-[#047183] font-semibold">
            {initials(clientName)}
          </div>
          <div className="flex flex-col">
            <h1 className="font-exo2 text-[28px] font-semibold leading-[28px] text-[#00030A]">
              {clientName}
            </h1>
            <span className="text-[14px] text-[#717182]">
              Gestiona los proyectos y permisos de tu cliente
            </span>
          </div>
        </div>
        {view === "projects" ? (
          <Link
            href="#"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[#0F5F4C] px-3 text-white"
          >
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[17.5px] bg-[#66F2A5]">
              <Plus className="h-4 w-4 text-[#282828]" />
            </span>
            <span className="text-[15px] font-medium">Nuevo proyecto</span>
          </Link>
        ) : (
          <button
            onClick={() => setView("projects")}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#0F5F4C] px-3 text-[#0F5F4C]"
          >
            Volver a proyectos
          </button>
        )}
      </div>

      {/* Filters + Search */}
      <div className="flex items-center justify-between gap-5">
        {view === "projects" ? (
          <div className="flex items-center gap-3">
            <FilterPill
              label="Todos"
              active={filter === "todos"}
              onClick={() => setFilter("todos")}
            />
            <FilterPill
              label="Publicados"
              active={filter === "publicados"}
              onClick={() => setFilter("publicados")}
            />
            <FilterPill
              label="Borradores"
              active={filter === "borradores"}
              onClick={() => setFilter("borradores")}
            />
            <button
              onClick={() => setView("permissions")}
              className="inline-flex h-[34px] items-center justify-center rounded-full border border-[#0F5F4C] px-3 text-[13px] font-medium text-[#0F5F4C]"
            >
              Permisos ({membersCount})
            </button>
            <button
              onClick={() => setView("users")}
              className="inline-flex h-[34px] items-center justify-center rounded-full border border-[#0F5F4C] px-3 text-[13px] font-medium text-[#0F5F4C]"
            >
              Usuarios
            </button>
          </div>
        ) : (
          <div />
        )}
        <div className="flex h-[34px] w-full max-w-[455px] items-center gap-2 rounded-[12px] border border-[#D9DCE3] bg-white pl-0 pr-[15px]">
          <span className="flex h-full items-center border-r border-[#D9DCE3] px-2">
            <Search className="h-4 w-4 text-[#9C9EA9]" />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar"
            className="h-full w-full rounded-[12px] bg-transparent text-[14px] outline-none placeholder:text-[#555555]"
          />
        </div>
      </div>

      {view === "projects" ? (
        <>
          <h2 className="text-[20px] font-semibold text-[#00030A]">
            Todos los proyectos
          </h2>
          <ClientProjectsGrid
            clientId={clientId}
            filter={filter}
            search={search}
          />
        </>
      ) : view === "permissions" ? (
        <ClientPermissionsPanel clientId={clientId} search={search} />
      ) : (
        <ClientUsersPanel clientId={clientId} />
      )}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-[34px] rounded-full px-3 text-[13px] font-medium",
        active
          ? "bg-[#00030A] text-[#E6E6E7]"
          : "border border-[#0F5F4C] text-[#0F5F4C]"
      )}
    >
      {label}
    </button>
  );
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}
