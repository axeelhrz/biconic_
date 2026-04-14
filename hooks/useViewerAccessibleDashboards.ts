"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Dashboard } from "@/components/dashboard/DashboardCard";

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

type SupabaseDashboardRow = {
  id: string;
  title?: string | null;
  name?: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  status?: string | null;
  published?: boolean | null;
  description?: string | null;
  views?: number | null;
  user_id?: string | null;
  client_id?: string | null;
};

function clientDisplayName(row: {
  company_name?: string | null;
  individual_full_name?: string | null;
  type?: string | null;
}): string {
  if (row.type === "empresa" && row.company_name?.trim()) {
    return row.company_name.trim();
  }
  if (row.individual_full_name?.trim()) {
    return row.individual_full_name.trim();
  }
  return row.company_name?.trim() || "Cliente";
}

function mapRowToDashboard(row: SupabaseDashboardRow): Dashboard {
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
    clientId: row.client_id ?? undefined,
    ownerId: row.user_id ?? undefined,
  };
}

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
          setCompanies([]);
          setError("No hay un usuario autenticado.");
          return;
        }

        const { data: cmData, error: cmErr } = await supabase
          .from("client_members")
          .select(
            `
            id,
            client_id,
            role,
            clients (
              company_name,
              individual_full_name,
              type
            )
          `
          )
          .eq("user_id", user.id)
          .eq("is_active", true);
        if (cmErr) throw cmErr;

        const memberships = (cmData ?? []) as Array<{
          id: string;
          client_id: string;
          role: string | null;
          clients:
            | {
                company_name?: string | null;
                individual_full_name?: string | null;
                type?: string | null;
              }
            | null;
        }>;

        const userClientIds = new Set(
          memberships.map((m) => String(m.client_id))
        );
        const memberIds = memberships.map((m) => String(m.id));

        const companySummaries: ViewerCompanySummary[] = memberships.map(
          (m) => ({
            clientId: String(m.client_id),
            name: m.clients
              ? clientDisplayName(m.clients)
              : "Cliente",
            memberRole: m.role,
          })
        );

        const { data: ownData, error: ownErr } = await supabase
          .from("dashboard")
          .select("*")
          .eq("user_id", user.id);
        if (ownErr) throw ownErr;
        const ownRows = (ownData as SupabaseDashboardRow[] | null) ?? [];

        let sharedDashboardIds: string[] = [];
        if (memberIds.length > 0) {
          const { data: permData, error: permErr } = await supabase
            .from("dashboard_has_client_permissions")
            .select("dashboard_id,is_active")
            .in("client_member_id", memberIds)
            .eq("is_active", true);
          if (permErr) throw permErr;
          sharedDashboardIds = (permData ?? [])
            .map((p: { dashboard_id?: string | null }) => p?.dashboard_id)
            .filter((v): v is string => typeof v === "string");
        }

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

        const allowedClient = userClientIds;
        const filteredRows = allRows.filter((row) => {
          const isOwner = row.user_id === user.id;
          if (isOwner) return true;
          const cid = row.client_id ? String(row.client_id) : null;
          if (!cid || allowedClient.size === 0) return false;
          return allowedClient.has(cid);
        });

        const mappedList: Dashboard[] = filteredRows.map(mapRowToDashboard);
        const deduped = Array.from(
          mappedList
            .reduce((m, d) => m.set(d.id, d), new Map<string, Dashboard>())
            .values()
        );

        if (!isMounted) return;
        setDashboards(deduped);
        setCompanies(companySummaries);
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
