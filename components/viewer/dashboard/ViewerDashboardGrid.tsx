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
