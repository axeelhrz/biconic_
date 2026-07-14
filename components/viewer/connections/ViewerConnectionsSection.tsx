"use client";
import React from "react";
import { useUserRole } from "@/hooks/useUserRole";

export default function ViewerConnectionsSection() {
  const { role } = useUserRole();
  return (
    <div
      className="mx-auto box-border flex w-full max-w-[1390px] flex-col gap-6 rounded-2xl border px-4 py-6 sm:rounded-[30px] sm:px-10 sm:py-8"
      style={{
        background: "var(--platform-bg-elevated)",
        borderColor: "var(--platform-border)",
      }}
    >
      <h1 className="text-2xl font-semibold text-[var(--platform-fg)]">Conexiones (Viewer)</h1>
      <p className="text-sm text-[var(--platform-fg-muted)]">
        Listado de conexiones en modo sólo lectura.
      </p>
      <p className="text-xs text-[var(--platform-muted)]">
        Rol detectado: {role ?? "desconocido"}
      </p>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {["Postgres", "MySQL", "MariaDB", "SQLServer"].map((name) => (
          <li
            key={name}
            className="p-4 rounded-xl border border-[var(--platform-border)] bg-[var(--platform-surface)]"
          >
            <p className="font-medium text-[var(--platform-fg)]">{name}</p>
            <p className="text-xs text-[var(--platform-fg-muted)]">Estado: Activa</p>
            <button className="mt-2 text-xs px-3 py-1 rounded-full bg-[var(--platform-accent)] text-[var(--platform-accent-fg)]">
              Ver
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
