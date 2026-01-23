"use client";
import { useEffect, useState } from "react";
// 1. Importar el nuevo componente y su tipo de datos
import DatabaseConnectionCard, { Connection } from "./ConnectionsCard";
import { createClient } from "@/lib/supabase/client";

type DataTableMetaRow = {
  id: string;
  connection_id: string;
  import_status: string;
  updated_at: string;
  total_rows: number | null;
  physical_table_name: string | null;
};

interface ConnectionsGridProps {
  connections: Connection[];
  searchQuery?: string;
  onConfigure?: (id: string) => void;
  onDelete?: (id: string, title?: string) => void;
}

export default function ConnectionsGrid({
  connections,
  searchQuery = "",
  onConfigure,
  onDelete,
}: ConnectionsGridProps) {
  // Estado local solo si es necesario, pero aquí usamos props directamente.
  // Podríamos mantener 'loading' si quisiéramos mostrar spinner mientras se filtra, pero es instantáneo.
  
  // NOTE: El componente padre ahora se encarga de fetchear.


  // No usamos estado de carga/error local porque viene del servidor


  // 6. Simplificar el filtrado para buscar en los nuevos campos de texto
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredConnections = connections.filter((conn) => {
    if (!normalizedQuery) return true;
    return (
      conn.title.toLowerCase().includes(normalizedQuery) ||
      conn.host.toLowerCase().includes(normalizedQuery) ||
      conn.databaseName.toLowerCase().includes(normalizedQuery)
    );
  });

  if (connections.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
        No tienes conexiones de bases de datos aún.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filteredConnections.map((connection) => (
        // 7. Renderizar la nueva tarjeta con la prop correcta ('connection')
        <DatabaseConnectionCard
          key={connection.id}
          connection={connection}
          onConfigure={onConfigure}
          onDelete={onDelete}
        />
      ))}
      {filteredConnections.length === 0 && (
        <div className="col-span-full rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
          No se encontraron conexiones que coincidan con tu búsqueda.
        </div>
      )}
    </div>
  );
}
