import type { Dashboard } from "@/components/dashboard/DashboardCard";

export type ViewerDashboardFilter = "todos" | "publicados" | "borradores";

export function filterViewerDashboards(
  dashboards: Dashboard[],
  searchQuery: string,
  filter: ViewerDashboardFilter
): Dashboard[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return dashboards.filter((d) => {
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
}
