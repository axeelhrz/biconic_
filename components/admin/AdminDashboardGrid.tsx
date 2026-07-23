"use client";
import { useEffect, useState } from "react";
import DashboardCard, { Dashboard } from "@/components/dashboard/DashboardCard";
import { createClient } from "@/lib/supabase/client";
import { isOwnBackendEnabled } from "@/lib/api/backend-client";
import { DeleteDashboardDialog } from "./dashboard/DeleteDashboardDialog";
import { SearchX, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import {
  listAdminDashboardsForGrid,
  publishDashboardAdmin,
} from "@/app/admin/(main)/dashboard/actions";
import { dashboardPublishedStatusFromRow } from "@/lib/dashboard/dashboardPublishedFromRow";
import {
  AdminClientGroupSection,
  AdminResourceCardGrid,
} from "@/components/admin/AdminClientGroupSections";
import { groupItemsByClient, clientDisplayName } from "@/lib/admin/clientGrouping";
import { resolveDashboardCoverImageUrl } from "@/lib/dashboard/dashboardCoverImage";

// Shape for mapping Supabase rows
type SupabaseDashboardRow = {
  id: string | number;
  title?: string;
  name?: string;
  image_url?: string | null;
  thumbnail_url?: string | null;
  status?: string | null;
  published?: boolean | null;
  visibility?: string | null;
  description?: string | null;
  views?: number | null;
  user_id?: string;
  client_id?: string | null;
  layout?: { widgets?: Array<{ gridOrder?: number; gridSpan?: number; type?: string; pageId?: string }>; pages?: Array<{ id: string; name?: string }>; activePageId?: string } | null;
};

type FilterType = "todos" | "publicados" | "borradores";

interface AdminDashboardGridProps {
  searchQuery?: string;
  filter?: FilterType;
  /** Base path for dashboard links, e.g., "/admin/dashboard" */
  basePath?: string;
  clientId?: string | null;
  /** Agrupar tarjetas por empresa/cliente (orden alfabético). */
  groupByClient?: boolean;
}

export default function AdminDashboardGrid({
  searchQuery = "",
  filter = "todos",
  basePath = "/admin/dashboard",
  clientId,
  groupByClient = true,
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

        if (isOwnBackendEnabled()) {
          const mapped = await listAdminDashboardsForGrid();
          if (!isMounted) return;
          setDashboards(mapped);
          setError(null);
          return;
        }

        const { data, error } = await supabase.from("dashboard").select("*");
        if (error) throw error;

        const rows = Array.isArray(data) ? (data as SupabaseDashboardRow[]) : [];

        const ownerIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
        const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean))) as string[];
        let ownerById = new Map<string, { full_name: string | null }>();
        let clientById = new Map<string, string>();

        if (ownerIds.length > 0) {
          const { data: owners } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ownerIds);

          const ownerList = Array.isArray(owners) ? owners : owners ? [owners] : [];
          ownerById = new Map(ownerList.map((o) => [o.id, o]));
        }

        if (clientIds.length > 0) {
          const { data: clientRows } = await supabase
            .from("clients")
            .select("id, company_name, individual_full_name, type")
            .in("id", clientIds);
          clientById = new Map(
            (clientRows ?? []).map((c: { id: string; company_name?: string | null; individual_full_name?: string | null; type?: string | null }) => [
              c.id,
              clientDisplayName(c),
            ])
          );
        }

        const mapped: Dashboard[] = rows.map((row) => {
          const status = dashboardPublishedStatusFromRow(row);
          const ownerProfile = row.user_id ? ownerById.get(row.user_id) : undefined;
          const cid = row.client_id ?? undefined;

          return {
            id: String(row.id),
            title: row.title ?? row.name ?? "Sin título",
            imageUrl: resolveDashboardCoverImageUrl({
              layout: row.layout,
              image_url: row.image_url,
              thumbnail_url: row.thumbnail_url,
            }),
            status,
            description: row.description ?? "",
            views: typeof row.views === "number" ? row.views : 0,
            owner: { fullName: ownerProfile?.full_name ?? "Desconocido" },
            clientId: cid,
            clientLabel: cid ? clientById.get(cid) : undefined,
            ownerId: row.user_id,
            layout: row.layout ?? undefined,
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

  const handlePublish = async (d: Dashboard) => {
    const res = await publishDashboardAdmin(d.id, true);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo publicar el dashboard");
      return;
    }
    toast.success("Dashboard publicado; los clientes lo verán como publicado.");
    setDashboards((prev) =>
      prev.map((x) => (x.id === d.id ? { ...x, status: "Publicado" } : x))
    );
  };

  const handleUnpublish = async (d: Dashboard) => {
    const res = await publishDashboardAdmin(d.id, false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo despublicar el dashboard");
      return;
    }
    toast.success("Dashboard despublicado.");
    setDashboards((prev) =>
      prev.map((x) => (x.id === d.id ? { ...x, status: "Borrador" } : x))
    );
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
    <>
      {groupByClient ? (
        <div className="flex flex-col gap-10">
          {groupItemsByClient(filtered).map((group) => (
            <AdminClientGroupSection
              key={group.clientId ?? "unassigned"}
              clientId={group.clientId}
              clientLabel={group.clientLabel}
              count={group.items.length}
            >
              <AdminResourceCardGrid>
                {group.items.map((dashboard) => (
                  <DashboardCard
                    key={dashboard.id}
                    dashboard={dashboard}
                    href={`${basePath}/${dashboard.id}`}
                    onDelete={handleDeleteClick}
                    onPublish={handlePublish}
                    onUnpublish={handleUnpublish}
                  />
                ))}
              </AdminResourceCardGrid>
            </AdminClientGroupSection>
          ))}
        </div>
      ) : (
        <AdminResourceCardGrid>
          {filtered.map((dashboard) => (
            <DashboardCard
              key={dashboard.id}
              dashboard={dashboard}
              href={`${basePath}/${dashboard.id}`}
              onDelete={handleDeleteClick}
              onPublish={handlePublish}
              onUnpublish={handleUnpublish}
            />
          ))}
        </AdminResourceCardGrid>
      )}
      <DeleteDashboardDialog 
        open={deleteDialogOpen} 
        onOpenChange={setDeleteDialogOpen}
        dashboardId={dashboardToDelete?.id || null}
        dashboardTitle={dashboardToDelete?.title || null}
        onSuccess={handleDeleteSuccess}
      />
      {filtered.length === 0 && dashboards.length > 0 && (
        <div
          className="col-span-full flex flex-col items-center justify-center rounded-2xl border py-16 px-6 text-center"
          style={{
            borderColor: "var(--platform-border)",
            background: "var(--platform-surface)",
          }}
        >
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
            style={{ background: "var(--platform-bg-elevated)", color: "var(--platform-fg-muted)" }}
          >
            <SearchX className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--platform-fg)" }}>
            Sin resultados
          </h3>
          <p className="text-sm max-w-sm" style={{ color: "var(--platform-fg-muted)" }}>
            No hay dashboards que coincidan con los filtros o la búsqueda. Probá otros términos o quitá filtros.
          </p>
        </div>
      )}
      {filtered.length === 0 && dashboards.length === 0 && (
        <div
          className="col-span-full flex flex-col items-center justify-center rounded-2xl border py-16 px-6 text-center"
          style={{
            borderColor: "var(--platform-border)",
            background: "var(--platform-surface)",
          }}
        >
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
            style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
          >
            <LayoutDashboard className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--platform-fg)" }}>
            Aún no hay dashboards
          </h3>
          <p className="text-sm max-w-sm" style={{ color: "var(--platform-fg-muted)" }}>
            Creá tu primer dashboard con el botón «Crear dashboard» arriba. Asignalo a un cliente y elegí las fuentes de datos.
          </p>
        </div>
      )}
    </>
  );
}
