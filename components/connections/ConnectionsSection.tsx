"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Connection } from "./ConnectionsCard";
// --- Iconos (sin cambios) ---
import PencilSquareIcon from "../icons/PencilSquareIcon";
import CheckCircleIcon from "../icons/CheckCircleIcon";
import ListBulletIcon from "../icons/ListBulletIcon";
import InformationCircleIcon from "../icons/InformationCircleIcon";
// --- Componentes (se añade ImportStatus) ---
import ConnectionsSectionHeader from "./ConnectionsSectionHeader";
import ConnectionsFilterBar from "./ConnectionsFilterBar";
import ConnectionsGrid from "./ConnectionsGrid";
import ConnectionsSyncSettings from "./ConnectionsSyncSettings";
import NewConnectionDialog from "./NewConnectionDialog";
import EditConnectionDialog from "./EditConnectionDialog";
import DeleteConnectionDialog from "./DeleteConnectionDialog";
import ImportStatus from "./importStatus";
import { useUser } from "@/hooks/useUser";

const statsData = [
  { id: "total", icon: ListBulletIcon, label: "Total de conexiones", value: 4 },
  { id: "active-etl", icon: CheckCircleIcon, label: "Etl activos", value: 8 },
  {
    id: "draws",
    icon: PencilSquareIcon,
    label: "Borradores",
    value: 8,
  },
  {
    id: "errores",
    icon: InformationCircleIcon,
    label: "Con errores",
    value: 8,
  },
];

interface ConnectionsSectionProps {
  initialConnections: Connection[];
}

export default function ConnectionsSection({ initialConnections }: ConnectionsSectionProps) {
  const { role } = useUser();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canCreate = role === "CREATOR" || role === "APP_ADMIN";
  // --- Estados existentes (sin cambios) ---
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "todos" | "publicados" | "borradores"
  >("todos");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedConnectionTitle, setSelectedConnectionTitle] = useState<
    string | null
  >(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // --- 2. AÑADIMOS EL NUEVO ESTADO PARA EL SEGUIMIENTO ---
  const [currentImportId, setCurrentImportId] = useState<number | null>(null);

  // --- Funciones existentes (sin cambios) ---
  const handleNewConnection = () => {
    setIsDialogOpen(true);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleFilter = (filter: "todos" | "publicados" | "borradores") => {
    setActiveFilter(filter);
  };

  const handleConfigure = (id: string) => {
    setSelectedConnectionId(id);
    setIsEditOpen(true);
  };

  const handleDelete = (id: string, title?: string) => {
    setSelectedConnectionId(id);
    setSelectedConnectionTitle(title ?? null);
    setIsDeleteOpen(true);
  };

  // --- 3. AÑADIMOS LA NUEVA FUNCIÓN HANDLER ---
  // Esta función se la pasaremos al diálogo para que nos notifique el ID de la importación.
  const handleImportStarted = (id: number) => {
    setCurrentImportId(id);
  };

  return (
    <div className="flex flex-col box-border w-full max-w-[1390px] px-10 py-8 mx-auto bg-[#FDFDFD] border border-[#ECECEC] rounded-[30px] gap-4">
      <ConnectionsSectionHeader
        title="Gestor de conexiones"
        subtitle="Configura y gestiona las conexiones a tus Bases de datos"
        buttonText="Nueva conexión"
        onButtonClick={handleNewConnection}
        showButton={canCreate}
      />

      <ConnectionsFilterBar
        onSearchChange={handleSearch}
        onFilterChange={handleFilter}
      />
      <ConnectionsGrid
        connections={initialConnections}
        onConfigure={handleConfigure}
        onDelete={handleDelete}
      />
      <ConnectionsSyncSettings />

      {/* --- 5. PASAMOS LA NUEVA PROP AL DIÁLOGO --- */}
      <NewConnectionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onCreated={() => {
            setRefreshKey((k) => k + 1); // Keep for local effects if any
            router.refresh(); 
        }}
      />

      {/* Diálogos existentes (sin cambios) */}
      <EditConnectionDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        connectionId={selectedConnectionId}
        onUpdated={() => {
            setRefreshKey((k) => k + 1);
            router.refresh();
        }}
      />
      <DeleteConnectionDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        connectionId={selectedConnectionId}
        connectionTitle={selectedConnectionTitle}
        onDeleted={() => {
            setRefreshKey((k) => k + 1);
            router.refresh();
        }}
      />
    </div>
  );
}
