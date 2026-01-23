"use client";
import React from "react";
import { useUserRole } from "@/hooks/useUserRole";

export default function ViewerEtlSection() {
  const { role } = useUserRole();
  return (
    <div className="flex flex-col box-border w-full max-w-[1390px] px-10 py-8 mx-auto bg-[#FDFDFD] border border-[#ECECEC] rounded-[30px] gap-6">
      <h1 className="text-2xl font-semibold">ETL (Viewer)</h1>
      <p className="text-sm text-[#54565B]">
        Procesos ETL visibles, sin permisos de edición.
      </p>
      <p className="text-xs text-[#777]">
        Rol detectado: {role ?? "desconocido"}
      </p>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {["Carga Ventas", "Normalizar Clientes", "Actualizar Inventario"].map(
          (etl) => (
            <div
              key={etl}
              className="p-4 rounded-xl border border-[#ECECEC] bg-white flex flex-col gap-2"
            >
              <p className="font-medium">{etl}</p>
              <p className="text-xs text-[#54565B]">
                Última ejecución: 2025-11-14
              </p>
              <button className="text-xs px-3 py-1 rounded-full bg-[#0F5F4C] text-white self-start">
                Ver detalle
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
