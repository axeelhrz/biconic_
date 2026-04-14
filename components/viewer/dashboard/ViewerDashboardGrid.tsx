"use client";
import DashboardCard, {
  type Dashboard,
} from "@/components/dashboard/DashboardCard";
import {
  filterViewerDashboards,
  type ViewerDashboardFilter,
} from "@/components/viewer/dashboard/filterViewerDashboards";

interface ViewerDashboardGridProps {
  dashboards: Dashboard[];
  loading: boolean;
  error: string | null;
  searchQuery?: string;
  filter?: ViewerDashboardFilter;
}

export default function ViewerDashboardGrid({
  dashboards,
  loading,
  error,
  searchQuery = "",
  filter = "todos",
}: ViewerDashboardGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse overflow-hidden rounded-[15px] bg-[var(--platform-surface)] border border-[var(--platform-border)]"
          >
            <div className="h-[193px] w-full bg-[var(--platform-bg)]" />
            <div className="space-y-3 p-5">
              <div className="h-4 w-1/2 bg-[var(--platform-surface-hover)]" />
              <div className="h-3 w-1/3 bg-[var(--platform-surface-hover)]" />
              <div className="h-3 w-full bg-[var(--platform-surface-hover)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--platform-danger)]/40 bg-[var(--platform-danger)]/10 p-4 text-sm text-[var(--platform-danger)]">
        {error}
      </div>
    );
  }

  const filtered = filterViewerDashboards(
    dashboards,
    searchQuery,
    filter
  );

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {(filtered.length > 0 ? filtered : []).map((dashboard) => (
        <DashboardCard
          key={dashboard.id}
          dashboard={dashboard}
          href={`/viewer/dashboard/${dashboard.id}/view`}
        />
      ))}
      {filtered.length === 0 && dashboards.length > 0 && (
        <div className="col-span-full rounded-xl border border-[var(--platform-border)] bg-[var(--platform-surface)] p-6 text-center text-sm text-[var(--platform-fg-muted)]">
          No hay resultados para los filtros aplicados.
        </div>
      )}
      {filtered.length === 0 && dashboards.length === 0 && (
        <div className="col-span-full rounded-xl border border-[var(--platform-border)] bg-[var(--platform-surface)] p-6 text-center text-sm text-[var(--platform-fg-muted)]">
          No tienes dashboards aún.
        </div>
      )}
    </div>
  );
}
