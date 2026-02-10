"use client";
import { useEffect, useState } from "react";
import AdminClientCard, { type AdminClientCardData } from "./AdminClientCard";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Database } from "@/lib/supabase/database.types";

// Define un tipo para la fila de datos que esperamos de la consulta
// Esto mejora la seguridad de tipos y el autocompletado.
type ClientWithPlanAndCounts = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  "id" | "company_name" | "status"
> & {
  subscriptions:
    | {
        plans: Pick<
          Database["public"]["Tables"]["plans"]["Row"],
          "name"
        > | null;
      }[]
    | null;
  dashboard: { count: number }[];
  etl: { count: number }[];
  client_members: { count: number }[];
};

export default function AdminRecentClients() {
  const [items, setItems] = useState<AdminClientCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function load() {
      try {
        setLoading(true);
        const { data: ures, error: uerr } = await supabase.auth.getUser();
        if (uerr) throw uerr;
        const user = ures.user;
        if (!user) {
          if (!active) return;
          setItems([]);
          setError("No autorizado");
          return;
        }

        // Obtiene los clientes más recientes y agrega el nombre del plan (via subscriptions) y los conteos
        const { data, error } = await supabase
          .from("clients")
          .select(
            `
            id,
            company_name,
            status,
            subscriptions (
              plans ( name )
            ),
            dashboard ( count ),
            etl ( count ),
            client_members ( count )
          `
          )
          .order("created_at", { ascending: false })
          .limit(3);

        if (error) throw error;

        const mapped: AdminClientCardData[] = (
          data as ClientWithPlanAndCounts[]
        ).map((row) => {
          const dashboardsCount = row.dashboard?.[0]?.count ?? 0;
          const etlsCount = row.etl?.[0]?.count ?? 0;
          const membersCount = row.client_members?.[0]?.count ?? 0;
          
          // Obtiene el nombre del plan de la primera suscripción encontrada (si existe)
          let planName = "Sin Plan";
          if (row.subscriptions && row.subscriptions.length > 0) {
            // Podríamos filtrar por status='active' si fuera necesario, 
            // por ahora tomamos el plan de la primera suscripción devuelta.
            planName = row.subscriptions[0].plans?.name ?? "Sin Plan";
          }

          return {
            id: row.id,
            companyName: row.company_name ?? "Empresa",
            status: row.status ?? "Activo",
            tag: planName, // Usa el nombre del plan como tag
            dashboardsCount,
            etlsCount,
            membersCount,
            imageUrl: "/images/biconic2-logo.png",
          } satisfies AdminClientCardData;
        });

        if (!active) return;
        setItems(mapped);
        setError(null);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ?? "Error al cargar clientes");
        setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex w-full items-center justify-between">
        <h2 className="text-[20px] font-semibold leading-7" style={{ color: "var(--platform-fg)" }}>
          Clientes recientes
        </h2>
        <Link
          href="/admin/clients"
          className="text-[13px] font-medium hover:underline"
          style={{ color: "var(--platform-accent)" }}
        >
          Ver todo ↗
        </Link>
      </div>

      {error && (
        <div
          className="rounded-xl border p-3 text-sm"
          style={{
            borderColor: "var(--platform-danger)",
            background: "rgba(248,113,113,0.1)",
            color: "var(--platform-danger)",
          }}
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-5">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[402.96px] w-[402px] animate-pulse overflow-hidden rounded-[15.29px] border"
                style={{
                  background: "var(--platform-surface)",
                  borderColor: "var(--platform-border)",
                }}
              >
                <div className="h-[190.83px] w-full" style={{ background: "var(--platform-surface-hover)" }} />
                <div className="space-y-3 p-5">
                  <div className="h-5 w-2/3 rounded" style={{ background: "var(--platform-surface-hover)" }} />
                  <div className="h-4 w-1/3 rounded" style={{ background: "var(--platform-surface-hover)" }} />
                  <div className="h-10 w-full rounded" style={{ background: "var(--platform-surface-hover)" }} />
                </div>
              </div>
            ))
          : items.map((c) => <AdminClientCard key={c.id} data={c} />)}
      </div>
    </div>
  );
}
