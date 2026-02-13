"use client";

import React from "react";

const DND_MIME = "application/x-biconic-widget";

type ConnectionPaletteItemProps = {
  connection: {
    id: string | number;
    name?: string | null;
    db_host?: string | null;
    db_name?: string | null;
    type?: string | null;
    original_file_name?: string | null;
  };
};

export default function ConnectionPaletteItem({
  connection,
}: ConnectionPaletteItemProps) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      DND_MIME,
      JSON.stringify({
        type: "connection",
        connectionId: connection.id,
        title: connection.name || `Conn ${connection.id}`,
        source: "connections-palette",
      })
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <button
      draggable
      onDragStart={onDragStart}
      className="w-full flex items-center gap-3 p-3 rounded-xl border cursor-grab active:cursor-grabbing transition-colors hover:opacity-90"
      style={{
        background: "var(--platform-surface-hover)",
        borderColor: "var(--platform-border)",
        color: "var(--platform-fg)",
      }}
      title="Arrastrar al lienzo"
    >
      <span
        className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      </span>
      <div className="min-w-0 flex-1 text-left">
        <div className="text-sm font-medium truncate" style={{ color: "var(--platform-fg)" }}>
          {connection.name || `Conexión ${connection.id}`}
        </div>
        <div className="text-xs truncate" style={{ color: "var(--platform-fg-muted)" }}>
          {connection.type === "excel_file" || connection.type === "excel"
            ? connection.original_file_name || "archivo"
            : connection.db_host || "host"}
          {connection.type === "excel_file" || connection.type === "excel"
            ? ""
            : ` · ${connection.db_name || "db"}`}
        </div>
      </div>
    </button>
  );
}
