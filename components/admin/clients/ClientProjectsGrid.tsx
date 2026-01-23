"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AdminDashboardProjectCard, {
  type Dashboard,
} from "@/components/admin/dashboard/AdminDashboardProjectCard";

export type ProjectFilter = "todos" | "publicados" | "borradores";

export default function ClientProjectsGrid({
  clientId,
  filter,
  search,
}: {
  clientId: string;
  filter: ProjectFilter;
  search: string;
}) {
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

        let query = supabase
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
          .eq("client_id", clientId)
          .order("created_at", { ascending: false });

        if (filter === "publicados") query = query.eq("published", true);
        if (filter === "borradores") query = query.eq("published", false);
        if (search.trim()) query = query.ilike("title", `%${search.trim()}%`);

        const { data, error } = await query;
        if (error) throw error;

        const mapped: Dashboard[] = (data ?? []).map((row: any) => {
          const clientData = row.clients;
          const peopleCount = clientData?.client_members?.[0]?.count ?? 0;
          return {
            id: String(row.id),
            title: row.title ?? "Sin título",
            imageUrl: row.image_url ?? "/Image.svg",
            status: row.published ? "Publicado" : "Borrador",
            description: row.description ?? "",
            company: clientData?.company_name ?? "Empresa Desconocida",
            peopleCount,
          } satisfies Dashboard;
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
  }, [clientId, filter, search]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {loading
        ? Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse overflow-hidden rounded-[15px] bg-white shadow-[0px_4px_24px_rgba(109,141,173,0.15)]"
            >
              <div className="h-[193px] w-full bg-gray-200" />
              <div className="space-y-3 p-5">
                <div className="h-4 w-1/2 bg-gray-200" />
                <div className="h-3 w-1/3 bg-gray-200" />
                <div className="h-3 w-full bg-gray-200" />
              </div>
            </div>
          ))
        : items.map((d) => (
            <AdminDashboardProjectCard key={d.id} dashboard={d} />
          ))}
    </div>
  );
}
