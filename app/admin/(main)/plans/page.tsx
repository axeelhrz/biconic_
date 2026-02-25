"use client";

import { CreditCard } from "lucide-react";
import AdminPlansTable from "@/components/admin/plans/AdminPlansTable";

export default function AdminPlansPage() {
  return (
    <div className="flex w-full flex-col min-h-0">
      {/* Hero: mismo estilo que /admin/dashboard */}
      <section
        className="rounded-3xl border px-6 py-8 sm:px-8 sm:py-10 mb-8"
        style={{
          background: "linear-gradient(135deg, var(--platform-bg-elevated) 0%, var(--platform-surface) 50%)",
          borderColor: "var(--platform-border)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
        }}
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
            >
              <CreditCard className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--platform-fg)" }}>
                Planes
              </h1>
              <p className="mt-1 text-sm sm:text-base max-w-xl" style={{ color: "var(--platform-fg-muted)" }}>
                Gestioná planes y suscripciones. Definí precios mensuales y anuales, y asignálos a los clientes.
              </p>
            </div>
          </div>
        </div>
      </section>

      <AdminPlansTable />
    </div>
  );
}
