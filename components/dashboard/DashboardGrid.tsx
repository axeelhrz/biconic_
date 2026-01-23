"use client";
import { useEffect, useState } from "react";
import DashboardCard, { Dashboard } from "./DashboardCard";
import { getDashboardsAction } from "@/app/(main)/dashboard/actions";

// Optional shape to help with mapping Supabase rows to the Dashboard UI type
type SupabaseDashboardRow = {
  id: string | number;
  title?: string;
  name?: string;
  image_url?: string | null;
  thumbnail_url?: string | null;
  status?: string | null; // e.g., "Publicado" | "Borrador" | other
  published?: boolean | null;
  description?: string | null;
  views?: number | null;
  user_id?: string;
  user?: { full_name?: string | null } | null;
};

type FilterType = "todos" | "publicados" | "borradores";

interface DashboardGridProps {
  searchQuery?: string;
  filter?: FilterType;
}

export default function DashboardGrid({
  searchQuery = "",
  filter = "todos",
}: DashboardGridProps) {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        const { ok, data, error } = await getDashboardsAction();
        
        if (!ok) {
            throw new Error(error || "Error al cargar dashboards");
        }

        if (!isMounted) return;
        setDashboards(data as Dashboard[]);
        setError(null);
      } catch (err: any) {
        if (!isMounted) return;
        console.error("DashboardGrid load error:", err);
        setError(err?.message ?? "Error cargando dashboards");
        setDashboards([]);
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
  const filtered = dashboards.filter((d) => {
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

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {/* Card fija que dirige a /tableau-dashboard */}
      <DashboardCard
        key="tableau-dashboard-fixed"
        dashboard={{
          id: "tableau-dashboard",
          title: "Tableau Dashboard",
          imageUrl: "/Image.svg",
          status: "Publicado",
          description: "Explora tu tablero de Tableau",
          views: 0,
        }}
        href="/tableau-dashboard"
      />
      <DashboardCard
        key="tableau-dashboard-fixed"
        dashboard={{
          id: "tableau-dashboard",
          title: "Tableau Dashboard 2",
          imageUrl: "/Image.svg",
          status: "Publicado",
          description: "Explora tu tablero de Tableau",
          views: 0,
        }}
        href="/tableau-dashboard-2"
      />
      <DashboardCard
        key="tableau-dashboard-fixed"
        dashboard={{
          id: "tableau-dashboard",
          title: "Tableau Dashboard 3",
          imageUrl: "/Image.svg",
          status: "Publicado",
          description: "Explora tu tablero de Tableau",
          views: 0,
        }}
        href="/tableau-dashboard-3"
      />

      {(filtered.length > 0 ? filtered : []).map((dashboard) => (
        <DashboardCard key={dashboard.id} dashboard={dashboard} />
      ))}
      {filtered.length === 0 && dashboards.length > 0 && (
        <div className="col-span-full rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
          No hay resultados para los filtros aplicados.
        </div>
      )}
      {filtered.length === 0 && dashboards.length === 0 && (
        <div className="col-span-full rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
          No tienes dashboards aún.
        </div>
      )}
    </div>
  );
}
