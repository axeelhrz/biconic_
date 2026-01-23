"use client";
import { useEffect, useState } from "react";
import EtlCard, { Etl } from "./EtlCard";
import { getEtlsAction } from "@/app/(main)/etl/actions";

type FilterType = "todos" | "publicados" | "borradores";

interface EtlGridProps {
  searchQuery?: string;
  filter?: FilterType;
}

export default function EtlGrid({
  searchQuery = "",
  filter = "todos",
}: EtlGridProps) {
  const [etls, setEtls] = useState<Etl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);

        const { ok, data: mapped, error: actionErr } = await getEtlsAction(searchQuery, filter);
        
        if (!ok || actionErr) {
            throw new Error(actionErr || "Error cargando ETLs");
        }

        if (!isMounted) return;
        setEtls(mapped || []);
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
        No tienes etls aún.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {(filtered.length > 0 ? filtered : []).map((etl) => (
        <EtlCard 
            key={etl.id} 
            etl={etl} 
            onDeleted={() => {
                setEtls(prev => prev.filter(e => e.id !== etl.id));
            }}
        />
      ))}
      {filtered.length === 0 && (
        <div className="col-span-full rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
          No hay resultados para los filtros aplicados.
        </div>
      )}
    </div>
  );
}
