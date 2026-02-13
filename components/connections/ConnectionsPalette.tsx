"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

import ConnectionPaletteItem from "@/components/connections/ConnectionPaletteItem";
import { Connection as ServerConnection } from "@/components/connections/ConnectionsCard"; // Adjust import if needed or define locally if strictly needed

const DND_MIME = "application/x-biconic-widget";

type Props = {
  connections?: ServerConnection[];
};

export default function ConnectionsPalette({ connections = [] }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter((r) =>
      [r.title, r.host, r.databaseName, r.type]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [connections, query]);



  return (
    <>
      {/* Título y guía del flujo (estética plataforma) */}
      <div className="flex flex-col items-start gap-1 w-full">
        <h2 className="font-semibold text-lg" style={{ color: "var(--platform-accent)" }}>
          Flujo de Datos
        </h2>
        <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
          1. Arrastrá una conexión → 2. Filtro → 3. Salida
        </p>
      </div>

      {/* Conexiones: origen de datos */}
      <div className="w-full">
        <h4 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>
          Conexiones
        </h4>
        {connections.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--platform-muted)" }}>No hay conexiones aún.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <ConnectionPaletteItem
                key={c.id}
                connection={{
                  id: c.id,
                  name: c.title,
                  db_host: c.host,
                  db_name: c.databaseName,
                  type: c.type,
                  original_file_name: c.type === "Excel" ? c.databaseName : null,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Separador */}
      <div className="w-full h-px" style={{ background: "var(--platform-border)" }} />

      {/* Filtro: paso 2 del flujo */}
      <div className="w-full">
        <h4 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>
          Filtro
        </h4>
        <button
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(
              DND_MIME,
              JSON.stringify({ type: "filter", title: "Filtro" })
            );
            e.dataTransfer.effectAllowed = "copy";
          }}
          className="w-full flex items-center gap-3 p-3 rounded-xl border cursor-grab active:cursor-grabbing transition-colors hover:opacity-90"
          style={{
            background: "var(--platform-surface-hover)",
            borderColor: "var(--platform-border)",
            color: "var(--platform-fg)",
          }}
          title="Arrastrar nodo Filtro"
        >
          <span className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}>F</span>
          <span className="text-sm font-medium">Filtro de columnas</span>
        </button>
      </div>

      {/* Transformaciones */}
      <div className="w-full">
        <h4 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>
          Transformaciones
        </h4>
        <button
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(
              DND_MIME,
              JSON.stringify({ type: "clean", title: "Limpieza" })
            );
            e.dataTransfer.effectAllowed = "copy";
          }}
          className="w-full flex items-center gap-3 p-3 rounded-xl border cursor-grab active:cursor-grabbing transition-colors hover:opacity-90"
          style={{
            background: "var(--platform-surface-hover)",
            borderColor: "var(--platform-border)",
            color: "var(--platform-fg)",
          }}
          title="Arrastrar nodo Limpieza"
        >
          <span className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--platform-success-dim)", color: "var(--platform-success)" }}>L</span>
          <span className="text-sm font-medium">Limpieza</span>
        </button>
      </div>

      {/* Salidas */}
      <div className="w-full">
        <h4 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>
          Salidas
        </h4>
        <button
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(
              DND_MIME,
              JSON.stringify({ type: "end", title: "Fin" })
            );
            e.dataTransfer.effectAllowed = "copy";
          }}
          className="w-full flex items-center gap-3 p-3 rounded-xl border cursor-grab active:cursor-grabbing transition-colors hover:opacity-90"
          style={{
            background: "var(--platform-surface-hover)",
            borderColor: "var(--platform-border)",
            color: "var(--platform-fg)",
          }}
          title="Arrastrar nodo Fin"
        >
          <span className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--platform-success-dim)", color: "var(--platform-success)" }}>✓</span>
          <span className="text-sm font-medium">Fin</span>
        </button>
      </div>
    </>
  );
}
