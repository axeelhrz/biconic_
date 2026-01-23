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
      className="flex flex-col justify-center items-start p-[8px_15px] gap-[10px] w-[230px] h-[54px] bg-white border border-[#DDDDE2] rounded-[30px] cursor-grab active:cursor-grabbing hover:bg-gray-50"
      title="Arrastrar al lienzo"
    >
      <div className="flex items-center gap-2 w-[200px] h-[38px]">
        <div className="flex justify-center items-center p-[6px] w-9 h-[38px] bg-[#B2F0FA] rounded-[20px]">
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              fill="#0692AA"
            />
            <polyline points="14,2 14,8 20,8" fill="#0692AA" />
            <line
              x1="16"
              y1="13"
              x2="8"
              y2="13"
              stroke="#0692AA"
              strokeWidth="2"
            />
            <line
              x1="16"
              y1="17"
              x2="8"
              y2="17"
              stroke="#0692AA"
              strokeWidth="2"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[#00030A] text-sm truncate">
            {connection.name || `Conexión ${connection.id}`}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {connection.type === "excel_file" || connection.type === "excel"
              ? connection.original_file_name || "archivo"
              : connection.db_host || "host desconocido"}
            {connection.type === "excel_file" || connection.type === "excel"
              ? ""
              : ` · ${connection.db_name || "db"}`}
          </div>
        </div>
      </div>
    </button>
  );
}
