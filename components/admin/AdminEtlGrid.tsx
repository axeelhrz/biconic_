"use client";
import { useEffect, useState } from "react";
import EtlCard, { Etl } from "@/components/etl/EtlCard";
import { createClient } from "@/lib/supabase/client";

// Optional shape to help with mapping Supabase rows to the Etl UI type
type SupabaseEtlRow = {
  id: string | number;
  title?: string;
  name?: string;
  image_url?: string | null;
  thumbnail_url?: string | null;
  status?: string | null; 
  published?: boolean | null;
  description?: string | null;
  views?: number | null;
  user_id?: string;
  client_id?: string | null;
};

type FilterType = "todos" | "publicados" | "borradores";

interface AdminEtlGridProps {
  searchQuery?: string;
  filter?: FilterType;
}

export default function AdminEtlGrid({
  searchQuery = "",
  filter = "todos",
}: AdminEtlGridProps) {
  const [etls, setEtls] = useState<Etl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    async function load() {
      try {
        setLoading(true);

        // Fetch ALL Etls (Admin View)
        const { data, error } = await supabase.from("etl").select("*");

        if (error) throw error;

        const rows = (data as SupabaseEtlRow[] | null) ?? [];

        // Fetch owners
        const ownerIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
        let ownerById = new Map<string, { full_name: string | null }>();

        if (ownerIds.length > 0) {
            const { data: owners } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ownerIds);
            
            ownerById = new Map((owners ?? []).map((o) => [o.id, o]));
        }

        const mapped: Etl[] =
          rows.map((row) => {
            const status: Etl["status"] =
              row.status === "Publicado" || row.status === "Borrador"
                ? row.status
                : row.published
                ? "Publicado"
                : "Borrador";

             const ownerProfile = row.user_id ? ownerById.get(row.user_id) : undefined;

            return {
              id: String(row.id),
              title: row.title ?? row.name ?? "Sin título",
              imageUrl: row.image_url ?? row.thumbnail_url ?? "/Image.svg",
              status,
              description: row.description ?? "",
              views: typeof row.views === "number" ? row.views : 0,
              lastExecution: (row as any).lastExecution ?? null,
              nextExecution: (row as any).nextExecution ?? null,
              createdAt: (row as any).createdAt ?? null,
              clientId: row.client_id ?? "",
              ownerId: row.user_id,
              owner: row.user_id ? { fullName: ownerById.get(row.user_id)?.full_name ?? null } : undefined,
            } satisfies Etl;
          });

        if (!isMounted) return;
        setEtls(mapped);
        setError(null);
      } catch (err: any) {
        if (!isMounted) return;
        setError(err?.message ?? "Error cargando Etls");
        setEtls([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  // Apply client-side filtering based on props
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = etls.filter((d) => {
    const matchesQuery = normalizedQuery
      ? d.title.toLowerCase().includes(normalizedQuery) ||
        d.description.toLowerCase().includes(normalizedQuery)
      : true;
    const matchesFilter =
      filter === "todos"
        ? true
        : filter === "publicados"
        ? d.status === "Publicado"
        : d.status === "Borrador";
    return matchesQuery && matchesFilter;
  });

  if (etls.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
        No hay etls en la plataforma.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {(filtered.length > 0 ? filtered : []).map((etl) => (
        <EtlCard key={etl.id} etl={etl} basePath="/admin/etl" />
      ))}
      {filtered.length === 0 && (
        <div className="col-span-full rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
          No hay resultados para los filtros aplicados.
        </div>
      )}
    </div>
  );
}
