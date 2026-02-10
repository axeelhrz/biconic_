"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AdminDashboardProjectCard, {
  type Dashboard,
} from "./AdminDashboardProjectCard";
import { createClient } from "@/lib/supabase/client";

export default function AdminRecentProjects() {
  const [items, setItems] = useState<Dashboard[]>([]);
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

        // FIX: Use a nested query to go from dashboard -> clients -> client_members
        const { data, error } = await supabase
          .from("dashboard")
          .select(
            `
            *,
            clients (
              company_name,
              client_members ( count )
            )
          `
          )
          .order("created_at", { ascending: false })
          .limit(4);

        if (error) {
          // Provide more specific error feedback if the query fails
          console.error("Supabase query error:", error);
          throw error;
        }

        // FIX: Update the mapping to reflect the new nested data structure
        const mapped: Dashboard[] = (data ?? []).map((row: any) => {
          const clientData = row.clients;
          const peopleCount = clientData?.client_members?.[0]?.count ?? 0;

          return {
            id: String(row.id),
            title: row.title ?? "Sin título",
            imageUrl: row.image_url ?? "/Image.svg",
            status: row.published ? "Publicado" : "Borrador",
            description: row.description ?? "",

            // Data is now nested inside the 'clients' object
            company: clientData?.company_name ?? "Empresa Desconocida",
            peopleCount: peopleCount,
          };
        });

        if (!active) return;
        setItems(mapped);
        setError(null);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ?? "Error al cargar proyectos");
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

  // ... rest of the component JSX is unchanged
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex w-full items-center justify-between">
        <h2 className="text-[20px] font-semibold leading-7" style={{ color: "var(--platform-fg)" }}>
          Proyectos recientes
        </h2>
        <Link
          href="/admin/dashboard"
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse overflow-hidden rounded-[15px] border"
                style={{
                  background: "var(--platform-surface)",
                  borderColor: "var(--platform-border)",
                }}
              >
                <div className="h-[193px] w-full" style={{ background: "var(--platform-surface-hover)" }} />
                <div className="space-y-3 p-5">
                  <div className="h-4 w-1/2 rounded" style={{ background: "var(--platform-surface-hover)" }} />
                  <div className="h-3 w-1/3 rounded" style={{ background: "var(--platform-surface-hover)" }} />
                  <div className="h-3 w-full rounded" style={{ background: "var(--platform-surface-hover)" }} />
                </div>
              </div>
            ))
          : items.map((d) => (
              <AdminDashboardProjectCard key={d.id} dashboard={d} />
            ))}
      </div>
    </div>
  );
}
