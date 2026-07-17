"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dashboard } from "@/components/dashboard/DashboardCard";
import { safeJsonResponse } from "@/lib/safe-json-response";

export type ViewerCompanySummary = {
  clientId: string;
  name: string;
  memberRole: string | null;
};

export type ViewerDashboardGroup = {
  clientId: string | null;
  clientLabel: string;
  dashboards: Dashboard[];
};

function buildDashboardGroups(
  enriched: Dashboard[],
  companies: ViewerCompanySummary[]
): ViewerDashboardGroup[] {
  const memberClientIds = new Set(companies.map((c) => c.clientId));
  const sorted = [...companies].sort((a, b) =>
    a.name.localeCompare(b.name, "es", { sensitivity: "base" })
  );
  const groups: ViewerDashboardGroup[] = sorted.map((c) => ({
    clientId: c.clientId,
    clientLabel: c.name,
    dashboards: enriched.filter((d) => d.clientId === c.clientId),
  }));

  const others = enriched.filter(
    (d) => !d.clientId || !memberClientIds.has(d.clientId)
  );
  if (others.length > 0) {
    groups.push({
      clientId: null,
      clientLabel: "Otros",
      dashboards: others,
    });
  }
  return groups;
}

export function useViewerAccessibleDashboards() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [companies, setCompanies] = useState<ViewerCompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/viewer/accessible-dashboards", {
          credentials: "include",
        });
        const json = await safeJsonResponse<{
          ok?: boolean;
          error?: string;
          dashboards?: Dashboard[];
          companies?: ViewerCompanySummary[];
        }>(res);

        if (!res.ok || json?.ok === false) {
          throw new Error(json?.error || "Error cargando dashboards");
        }

        if (!isMounted) return;
        setDashboards(Array.isArray(json?.dashboards) ? json.dashboards : []);
        setCompanies(Array.isArray(json?.companies) ? json.companies : []);
        setError(null);
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(
          err instanceof Error ? err.message : "Error cargando dashboards"
        );
        setDashboards([]);
        setCompanies([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const clientNameByClientId = useMemo(() => {
    return Object.fromEntries(
      companies.map((c) => [c.clientId, c.name] as const)
    ) as Record<string, string>;
  }, [companies]);

  const dashboardsWithLabels = useMemo((): Dashboard[] => {
    return dashboards.map((d) => ({
      ...d,
      clientLabel:
        d.clientId && clientNameByClientId[d.clientId]
          ? clientNameByClientId[d.clientId]
          : undefined,
    }));
  }, [dashboards, clientNameByClientId]);

  const dashboardGroups = useMemo(
    () => buildDashboardGroups(dashboardsWithLabels, companies),
    [dashboardsWithLabels, companies]
  );

  const publishedCount = dashboardsWithLabels.filter(
    (d) => d.status === "Publicado"
  ).length;
  const draftCount = dashboardsWithLabels.filter(
    (d) => d.status === "Borrador"
  ).length;

  return {
    dashboards: dashboardsWithLabels,
    companies,
    clientNameByClientId,
    dashboardGroups,
    loading,
    error,
    publishedCount,
    draftCount,
    totalCount: dashboardsWithLabels.length,
  };
}
