"use client";
import { useEffect, useState } from "react";
import DashboardCard, { Dashboard } from "@/components/dashboard/DashboardCard";
import { createClient } from "@/lib/supabase/client";

// Reutilizamos el mismo shape opcional que en DashboardGrid
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
};

type FilterType = "todos" | "publicados" | "borradores";

interface ViewerDashboardGridProps {
  searchQuery?: string;
  filter?: FilterType;
}

// Versión de solo visualización: los enlaces van a /dashboard/{id}/view
export default function ViewerDashboardGrid({
  searchQuery = "",
  filter = "todos",
}: ViewerDashboardGridProps) {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    async function load() {
      try {
        setLoading(true);
        const { data: userResp, error: userErr } =
          await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userResp.user;
        if (!user) {
          if (!isMounted) return;
          setDashboards([]);
          setError("No hay un usuario autenticado.");
          return;
        }

        // 1) Dashboards propios
        const { data: ownData, error: ownErr } = await supabase
          .from("dashboard")
          .select("*")
          .eq("user_id", user.id);
        if (ownErr) throw ownErr;
        const ownRows = (ownData as SupabaseDashboardRow[] | null) ?? [];

        // 2) Buscar memberships del usuario para identificar permisos compartidos
        const { data: cmData, error: cmErr } = await supabase
          .from("client_members")
          .select("id")
          .eq("user_id", user.id);
        if (cmErr) throw cmErr;
        const memberIds: string[] = (cmData ?? []).map((m: any) =>
          String(m.id)
        );

        // 3) Obtener dashboard_ids compartidos activos
        let sharedDashboardIds: string[] = [];
        if (memberIds.length > 0) {
          const { data: permData, error: permErr } = await supabase
            .from("dashboard_has_client_permissions")
            .select("dashboard_id,is_active")
            .in("client_member_id", memberIds)
            .eq("is_active", true);
          if (permErr) throw permErr;
          sharedDashboardIds = (permData ?? [])
            .map((p: any) => p?.dashboard_id)
            .filter((v: any): v is string => typeof v === "string");
        }

        // 4) Unificar y cargar faltantes
        const ownIds = ownRows.map((r) => String(r.id));
        const allIdsSet = new Set<string>([
          ...ownIds,
          ...sharedDashboardIds.map(String),
        ]);
        const unionIds = Array.from(allIdsSet);

        let allRows: SupabaseDashboardRow[] = [...ownRows];
        const missingIds = unionIds.filter((id) => !ownIds.includes(id));
        if (missingIds.length > 0) {
          const { data: sharedRows, error: sharedErr } = await supabase
            .from("dashboard")
            .select("*")
            .in("id", missingIds);
          if (sharedErr) throw sharedErr;
          if (sharedRows && Array.isArray(sharedRows)) {
            allRows = allRows.concat(sharedRows as SupabaseDashboardRow[]);
          }
        }

        // 5) Mapear a UI y deduplicar
        const mappedList: Dashboard[] = allRows.map((row) => {
          const status: Dashboard["status"] =
            row.status === "Publicado" || row.status === "Borrador"
              ? row.status
              : row.published
              ? "Publicado"
              : "Borrador";

          return {
            id: String(row.id),
            title: row.title ?? row.name ?? "Sin título",
            imageUrl: row.image_url ?? row.thumbnail_url ?? "/Image.svg",
            status,
            description: row.description ?? "",
            views: typeof row.views === "number" ? row.views : 0,
          } satisfies Dashboard;
        });

        const deduped = Array.from(
          mappedList
            .reduce((m, d) => m.set(d.id, d), new Map<string, Dashboard>())
            .values()
        );

        if (!isMounted) return;
        setDashboards(deduped);
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
      {/* Tarjetas fijas de Tableau */}
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
        key="tableau-dashboard-fixed-2"
        dashboard={{
          id: "tableau-dashboard-2",
          title: "Tableau Dashboard 2",
          imageUrl: "/Image.svg",
          status: "Publicado",
          description: "Explora tu tablero de Tableau",
          views: 0,
        }}
        href="/tableau-dashboard-2"
      />
      <DashboardCard
        key="tableau-dashboard-fixed-3"
        dashboard={{
          id: "tableau-dashboard-3",
          title: "Tableau Dashboard 3",
          imageUrl: "/Image.svg",
          status: "Publicado",
          description: "Explora tu tablero de Tableau",
          views: 0,
        }}
        href="/tableau-dashboard-3"
      />

      {(filtered.length > 0 ? filtered : []).map((dashboard) => (
        <DashboardCard
          key={dashboard.id}
          dashboard={dashboard}
          href={`/viewer/dashboard/${dashboard.id}/view`}
        />
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
