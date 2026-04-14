"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUserRole } from "@/hooks/useUserRole";
import { useViewerAccessibleDashboards } from "@/hooks/useViewerAccessibleDashboards";
import DashboardSectionHeader from "@/components/dashboard/DashboardSectionHeader";
import DashboardFilterBar from "@/components/dashboard/DashboardFilterBar";
import DashboardStatsGrid from "@/components/dashboard/DashboardStatsGrid";
import ViewerDashboardGrid from "@/components/viewer/dashboard/ViewerDashboardGrid";
import { viewerSectionDomId } from "@/components/viewer/dashboard/viewerSectionDomId";
import CheckCircleIcon from "@/components/icons/CheckCircleIcon";
import PencilSquareIcon from "@/components/icons/PencilSquareIcon";
import ListBulletIcon from "@/components/icons/ListBulletIcon";
import InformationCircleIcon from "@/components/icons/InformationCircleIcon";

function appRoleLabel(appRole: string | null): string {
  if (appRole === "VIEWER") return "Usuario";
  if (appRole === "CREATOR") return "Creador";
  if (appRole === "APP_ADMIN") return "Administrador";
  return appRole ?? "desconocido";
}

export default function ViewerDashboardsSection() {
  const searchParams = useSearchParams();
  const highlightClientId = searchParams.get("client");
  const { role } = useUserRole();
  const {
    dashboardGroups,
    companies,
    loading,
    error,
    publishedCount,
    draftCount,
    totalCount,
  } = useViewerAccessibleDashboards();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "todos" | "publicados" | "borradores"
  >("todos");

  useEffect(() => {
    if (!highlightClientId || loading) return;
    const id = viewerSectionDomId(highlightClientId);
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [highlightClientId, loading, dashboardGroups, totalCount, companies]);

  const totalViews = useMemo(
    () =>
      dashboardGroups.reduce(
        (sum, g) => sum + g.dashboards.reduce((s, d) => s + (d.views ?? 0), 0),
        0
      ),
    [dashboardGroups]
  );
  const avgViews =
    totalCount > 0 ? Math.round(totalViews / totalCount) : 0;

  const statsForGrid = useMemo(
    () => [
      {
        id: "total",
        icon: ListBulletIcon,
        label: "Dashboards totales",
        value: totalCount,
      },
      {
        id: "published",
        icon: CheckCircleIcon,
        label: "Publicados",
        value: publishedCount,
      },
      {
        id: "drafts",
        icon: InformationCircleIcon,
        label: "Borradores",
        value: draftCount,
      },
      {
        id: "avg-views",
        icon: PencilSquareIcon,
        label: "Vistas promedio",
        value: avgViews,
      },
    ],
    [totalCount, publishedCount, draftCount, avgViews]
  );

  return (
    <div
      className="flex flex-col box-border w-full max-w-[1390px] px-10 py-8 mx-auto border rounded-[30px] gap-4"
      style={{
        background: "var(--platform-bg-elevated)",
        borderColor: "var(--platform-border)",
      }}
    >
      <DashboardSectionHeader
        title="Dashboards"
        subtitle={`Modo visualización · ${appRoleLabel(role)}`}
        buttonText="Nuevo Dashboard"
        showButton={false}
      />
      <DashboardFilterBar
        onSearchChange={setSearchQuery}
        onFilterChange={setActiveFilter}
        variant="platform"
      />
      {!loading && !error ? (
        <DashboardStatsGrid stats={statsForGrid} />
      ) : null}
      {loading || error ? (
        <ViewerDashboardGrid
          dashboards={[]}
          loading={loading}
          error={error}
          searchQuery={searchQuery}
          filter={activeFilter}
        />
      ) : totalCount === 0 ? (
        <div className="flex flex-col gap-6">
          {companies.length > 0 ? (
            <div>
              <h2 className="text-base font-semibold text-[var(--platform-fg)] mb-3">
                Clientes asignados
              </h2>
              <ul className="flex flex-col gap-2 text-sm text-[var(--platform-fg-muted)]">
                {companies.map((c) => (
                  <li key={c.clientId} id={viewerSectionDomId(c.clientId)}>
                    <span className="font-medium text-[var(--platform-fg)]">{c.name}</span>
                    {" · "}
                    <Link
                      href={`/viewer/dashboard?client=${encodeURIComponent(c.clientId)}`}
                      className="text-[var(--platform-accent)] underline underline-offset-2"
                    >
                      Ir a la sección
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="rounded-xl border border-[var(--platform-border)] bg-[var(--platform-surface)] px-5 py-6 text-center text-sm text-[var(--platform-fg-muted)]">
            Acá se listan los dashboards publicados de tu empresa (mismo
            cliente) y los que te compartan con permiso. Si no ves ninguno,
            pedí que publiquen el dashboard o que te den acceso desde
            compartir.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {dashboardGroups.map((group) => {
            const sectionId = viewerSectionDomId(group.clientId);
            const isHighlighted =
              highlightClientId &&
              group.clientId !== null &&
              highlightClientId === group.clientId;
            return (
              <section
                key={sectionId}
                id={sectionId}
                className={`scroll-mt-28 rounded-2xl border border-transparent p-1 -m-1 transition-shadow ${
                  isHighlighted
                    ? "border-[var(--platform-accent)]/30 shadow-[0_0_0_3px_rgba(35,227,180,0.15)]"
                    : ""
                }`}
              >
                <h2 className="text-base font-semibold text-[var(--platform-fg)] mb-4">
                  {group.clientLabel}
                </h2>
                <ViewerDashboardGrid
                  dashboards={group.dashboards}
                  loading={false}
                  error={null}
                  searchQuery={searchQuery}
                  filter={activeFilter}
                />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
