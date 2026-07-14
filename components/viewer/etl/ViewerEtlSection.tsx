"use client";
import React from "react";
import { useUserRole } from "@/hooks/useUserRole";

export default function ViewerEtlSection() {
  const { role } = useUserRole();
  return (
    <div
      className="mx-auto box-border flex w-full max-w-[1390px] flex-col gap-6 rounded-2xl border px-4 py-6 sm:rounded-[30px] sm:px-10 sm:py-8"
      style={{
        background: "var(--platform-bg-elevated)",
        borderColor: "var(--platform-border)",
      }}
    >
      <h1 className="text-2xl font-semibold text-[var(--platform-fg)]">ETL (Viewer)</h1>
      <p className="text-sm text-[var(--platform-fg-muted)]">
        Procesos ETL visibles, sin permisos de edición.
      </p>
      <p className="text-xs text-[var(--platform-muted)]">
        Rol detectado: {role ?? "desconocido"}
      </p>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {["Carga Ventas", "Normalizar Clientes", "Actualizar Inventario"].map(
          (etl) => (
            <div
              key={etl}
              className="p-4 rounded-xl border border-[var(--platform-border)] bg-[var(--platform-surface)] flex flex-col gap-2"
            >
              <p className="font-medium text-[var(--platform-fg)]">{etl}</p>
              <p className="text-xs text-[var(--platform-fg-muted)]">
                Última ejecución: 2025-11-14
              </p>
              <button className="text-xs px-3 py-1 rounded-full bg-[var(--platform-accent)] text-[var(--platform-accent-fg)] self-start">
                Ver detalle
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
