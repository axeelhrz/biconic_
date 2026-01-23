"use client";
import React from "react";
import { useUserRole } from "@/hooks/useUserRole";

export default function ViewerConnectionsSection() {
  const { role } = useUserRole();
  return (
    <div className="flex flex-col box-border w-full max-w-[1390px] px-10 py-8 mx-auto bg-[#FDFDFD] border border-[#ECECEC] rounded-[30px] gap-6">
      <h1 className="text-2xl font-semibold">Conexiones (Viewer)</h1>
      <p className="text-sm text-[#54565B]">
        Listado de conexiones en modo sólo lectura.
      </p>
      <p className="text-xs text-[#777]">
        Rol detectado: {role ?? "desconocido"}
      </p>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {["Postgres", "MySQL", "MariaDB", "SQLServer"].map((name) => (
          <li
            key={name}
            className="p-4 rounded-xl border border-[#ECECEC] bg-white"
          >
            <p className="font-medium">{name}</p>
            <p className="text-xs text-[#54565B]">Estado: Activa</p>
            <button className="mt-2 text-xs px-3 py-1 rounded-full bg-[#0F5F4C] text-white">
              Ver
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
