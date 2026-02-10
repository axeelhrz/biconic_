"use client";
import { useEffect, useState } from "react";
import DashboardCard, { Dashboard } from "@/components/dashboard/DashboardCard";
// @ts-ignore
import { createClient } from "@/lib/supabase/client";
import { DeleteDashboardDialog } from "./dashboard/DeleteDashboardDialog";

// Shape for mapping Supabase rows
type SupabaseDashboardRow = {
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

interface AdminDashboardGridProps {
  searchQuery?: string;
  filter?: FilterType;
  /** Base path for dashboard links, e.g., "/admin/dashboard" */
  basePath?: string;
  clientId?: string | null;
}

export default function AdminDashboardGrid({
  searchQuery = "",
  filter = "todos",
  basePath = "/admin/dashboard",
  clientId,
}: AdminDashboardGridProps) {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dashboardToDelete, setDashboardToDelete] = useState<{ id: string; title: string} | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    async function load() {
      try {
        setLoading(true);

        // Fetch ALL dashboards (Admin View)
        let query = supabase.from("dashboard").select("*");
        
        // Optimize fetching if clientId is provided? 
        // We handle filtering client-side for "searchQuery" but clientId can be server-side filtered too.
        // But for consistency with search, let's keep fetching all or filter if simple.
        // Given we fetch all, let's filter client-side to avoid re-fetching on every filter change if manageable,
        // BUT user might have many dashboards. Ideally server-side.
        // However, existing code fetches ALL. Let's stick to client-side filter for now to match pattern,
        // unless performance is concern.
        
        const { data, error } = await query;

        if (error) throw error;

        const rows = (data as SupabaseDashboardRow[] | null) ?? [];

        // Fetch owners for all dashboards
        const ownerIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
        let ownerById = new Map<string, { full_name: string | null }>();

        if (ownerIds.length > 0) {
            const { data: owners } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ownerIds);
            
            ownerById = new Map((owners ?? []).map((o) => [o.id, o]));
        }

        const mapped: Dashboard[] = rows.map((row) => {
            const status: Dashboard["status"] =
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
              // Always show owner for admin
              owner: { fullName: ownerProfile?.full_name ?? "Desconocido" },
              clientId: row.client_id ?? undefined,
              ownerId: row.user_id,
            } satisfies Dashboard;
          });

        if (!isMounted) return;
        setDashboards(mapped);
        setError(null);
      } catch (err: any) {
        if (!isMounted) return;
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
  }, []); // Reload only on mount? Or if props change?

  const handleDeleteClick = (d: Dashboard) => {
    setDashboardToDelete({ id: d.id, title: d.title });
    setDeleteDialogOpen(true);
  };

  const handleDeleteSuccess = () => {
      // Remove from local state so we don't have to reload everything
      setDashboards(prev => prev.filter(d => d.id !== dashboardToDelete?.id));
  };
  // Existing code had [] dep array, meaning it loaded ONCE and filtered client-side.
  // I will respect that pattern.

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border p-4 text-sm"
        style={{
          borderColor: "var(--platform-danger)",
          background: "rgba(248,113,113,0.1)",
          color: "var(--platform-danger)",
        }}
      >
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
    
    // Client Filter
    const matchesClient = clientId ? d.clientId === clientId : true;
    
    return matchesQuery && matchesFilter && matchesClient;
  });

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {/* Card fija que dirige a /tableau-dashboard - Mostrar solo si no hay filtro de cliente (o si el cliente coincide, pero es hardcoded) */}
      {!clientId && (
      <>
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
        href="/admin/tableau-dashboard"
      />
      <DashboardCard
        key="tableau-dashboard-fixed-2"
        dashboard={{
          id: "tableau-dashboard",
          title: "Tableau Dashboard 2",
          imageUrl: "/Image.svg",
          status: "Publicado",
          description: "Explora tu tablero de Tableau",
          views: 0,
        }}
        href="/admin/tableau-dashboard-2"
      />
      <DashboardCard
        key="tableau-dashboard-fixed-3"
        dashboard={{
          id: "tableau-dashboard",
          title: "Tableau Dashboard 3",
          imageUrl: "/Image.svg",
          status: "Publicado",
          description: "Explora tu tablero de Tableau",
          views: 0,
        }}
        href="/admin/tableau-dashboard-3"
      />
      </>
      )}

      {(filtered.length > 0 ? filtered : []).map((dashboard) => (
        <DashboardCard
          key={dashboard.id}
          dashboard={dashboard}
          href={`${basePath}/${dashboard.id}`}
          onDelete={handleDeleteClick}
        />
      ))}
      <DeleteDashboardDialog 
        open={deleteDialogOpen} 
        onOpenChange={setDeleteDialogOpen}
        dashboardId={dashboardToDelete?.id || null}
        dashboardTitle={dashboardToDelete?.title || null}
        onSuccess={handleDeleteSuccess}
      />
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
