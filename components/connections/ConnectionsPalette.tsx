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
      {/* Back button */}
      <button className="flex items-center p-[10px_2px] gap-2 w-[230px] h-5 rounded-[50px]">
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
          <path
            d="M19 12H5M12 19l-7-7 7-7"
            stroke="#018394"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-[#018394] font-medium text-sm">
          Volver a panel general
        </span>
      </button>

      {/* Title section */}
      <div className="flex flex-col items-start gap-1 w-[230px] h-12">
        <h1 className="text-[#2DAA65] font-semibold text-[28px] leading-7">
          Flujo de Datos
        </h1>
        <p className="text-[#54565B] text-sm">
          Diseña tu Pipeline ETL sin código
        </p>
      </div>

      {/* Separator */}
      <div className="w-[230px] h-0 border-t border-[#D7D7D7]"></div>

      {/* Input y output section */}
      <h4 className="text-[#54565B] font-medium text-sm w-[230px]">
        Input y output
      </h4>

      <button
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(
            DND_MIME,
            JSON.stringify({ type: "filter", title: "Column filter" })
          );
          e.dataTransfer.effectAllowed = "copy";
        }}
        className="flex flex-col justify-center items-start p-[8px_15px] gap-[10px] w-[230px] h-[54px] bg-white border border-[#DDDDE2] rounded-[30px] cursor-grab active:cursor-grabbing hover:bg-gray-50"
        title="Arrastrar nodo de Filtro de Columnas"
      >
        <div className="flex items-center gap-2 w-[134px] h-[38px]">
          <div className="flex justify-center items-center p-[6px] w-9 h-[38px] bg-[#FAD3EA] rounded-[20px]">
            <svg className="w-[18px] h-[15px]" viewBox="0 0 18 15" fill="none">
              <path d="M0 0h18v15H0z" fill="#DD1A93" />
            </svg>
          </div>
          <span className="text-[#00030A] text-sm">Column filter</span>
        </div>
      </button>

      {/* Transformaciones section */}
      <h4 className="text-[#54565B] font-medium text-sm w-[230px]">
        Transformaciones
      </h4>

      {/* Salidas section */}
      <h4 className="text-[#54565B] font-medium text-sm w-[230px]">Salidas</h4>

      <button
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(
            DND_MIME,
            JSON.stringify({ type: "clean", title: "Limpieza" })
          );
          e.dataTransfer.effectAllowed = "copy";
        }}
        className="flex flex-col justify-center items-start p-[8px_15px] gap-[10px] w-[230px] h-[54px] bg-white border border-[#DDDDE2] rounded-[30px] cursor-grab active:cursor-grabbing hover:bg-gray-50"
        title="Arrastrar nodo de Limpieza"
      >
        <div className="flex items-center gap-2 w-[106px] h-[38px]">
          <div className="flex justify-center items-center p-[6px] w-9 h-[38px] bg-[#FED4D8] rounded-[20px]">
            <svg className="w-[18px] h-[18px]" viewBox="0 0 18 18" fill="none">
              <path d="M2.26 8.29L-0.05 -0.05h18v18z" fill="#EF293B" />
            </svg>
          </div>
          <span className="text-[#00030A] text-sm">Limpieza</span>
        </div>
      </button>

      <button
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(
            DND_MIME,
            JSON.stringify({ type: "end", title: "Fin" })
          );
          e.dataTransfer.effectAllowed = "copy";
        }}
        className="flex flex-col justify-center items-start p-[8px_15px] gap-[10px] w-[230px] h-[54px] bg-white border border-[#DDDDE2] rounded-[30px] cursor-grab active:cursor-grabbing hover:bg-gray-50"
        title="Arrastrar nodo Fin"
      >
        <div className="flex items-center gap-2 w-[106px] h-[38px]">
          <div className="flex justify-center items-center p-[6px] w-9 h-[38px] bg-[#4FE9C3] rounded-[20px]">
            <span className="text-black font-medium text-sm">Fin</span>
          </div>
        </div>
      </button>

      {/* Dynamic connections from database */}
      {connections.length === 0 ? (
        <div className="text-sm text-gray-600">No tienes conexiones aún.</div>
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
                // original_file_name not present in ServerConnection type, adapting
                original_file_name: c.type === "Excel" ? c.databaseName : null,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
