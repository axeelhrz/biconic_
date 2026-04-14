"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Dashboard } from "@/components/dashboard/DashboardCard";
import { dashboardPublishedStatusFromRow } from "@/lib/dashboard/dashboardPublishedFromRow";
import { CLIENT_MEMBER_ACTIVE_OR_FILTER } from "@/lib/client-members/clientMembershipActive";

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
  visibility?: string | null;
  description?: string | null;
  views?: number | null;
  user_id?: string | null;
  client_id?: string | null;
};

type DashboardPermissionRow = {
  dashboard_id?: string | null;
  client_member_id?: string | null;
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
  const status = dashboardPublishedStatusFromRow(row);

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
          .or(CLIENT_MEMBER_ACTIVE_OR_FILTER);
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

        let sharedPermissionRows: DashboardPermissionRow[] = [];
        if (memberIds.length > 0) {
          const { data: permData, error: permErr } = await supabase
            .from("dashboard_has_client_permissions")
            .select("dashboard_id,client_member_id,is_active")
            .in("client_member_id", memberIds)
            .eq("is_active", true);
          if (permErr) throw permErr;
          sharedPermissionRows = (permData ?? []) as DashboardPermissionRow[];
        }

        const memberClientByMemberId = new Map(
          memberships.map((m) => [String(m.id), String(m.client_id)] as const)
        );
        const sharedDashboardIds = sharedPermissionRows
          .map((p) => p.dashboard_id)
          .filter((v): v is string => typeof v === "string");
        const sharedDashboardIdSet = new Set(sharedDashboardIds.map(String));
        const accessClientIdsByDashboardId = new Map<string, Set<string>>();
        for (const perm of sharedPermissionRows) {
          const dashboardId = perm.dashboard_id ? String(perm.dashboard_id) : "";
          const memberId = perm.client_member_id
            ? String(perm.client_member_id)
            : "";
          if (!dashboardId || !memberId) continue;
          const clientId = memberClientByMemberId.get(memberId);
          if (!clientId) continue;
          const prev = accessClientIdsByDashboardId.get(dashboardId) ?? new Set();
          prev.add(clientId);
          accessClientIdsByDashboardId.set(dashboardId, prev);
        }

        const ownIds = ownRows.map((r) => String(r.id));
        const allIdsSet = new Set<string>([
          ...ownIds,
          ...sharedDashboardIds.map(String),
        ]);
        const unionIds = Array.from(allIdsSet);

        let sharedByIdRows: SupabaseDashboardRow[] = [];
        const missingIds = unionIds.filter((id) => !ownIds.includes(id));
        if (missingIds.length > 0) {
          const { data: sharedRows, error: sharedErr } = await supabase
            .from("dashboard")
            .select("*")
            .in("id", missingIds);
          if (sharedErr) throw sharedErr;
          if (sharedRows && Array.isArray(sharedRows)) {
            sharedByIdRows = sharedRows as SupabaseDashboardRow[];
          }
        }

        /** Dashboards del mismo cliente, publicados, sin requerir fila en `dashboard_has_client_permissions`. */
        let clientPublishedRows: SupabaseDashboardRow[] = [];
        if (userClientIds.size > 0) {
          const { data: clientDashData, error: clientDashErr } = await supabase
            .from("dashboard")
            .select("*")
            .in("client_id", Array.from(userClientIds));
          if (clientDashErr) throw clientDashErr;
          clientPublishedRows = ((clientDashData ?? []) as SupabaseDashboardRow[]).filter(
            (r) => dashboardPublishedStatusFromRow(r) === "Publicado"
          );
        }

        const rowById = new Map<string, SupabaseDashboardRow>();
        for (const r of ownRows) rowById.set(String(r.id), r);
        for (const r of sharedByIdRows) rowById.set(String(r.id), r);
        for (const r of clientPublishedRows) rowById.set(String(r.id), r);
        const allRows = Array.from(rowById.values());

        const filteredRows = allRows.filter((row) => {
          if (row.user_id === user.id) return true;
          if (sharedDashboardIdSet.has(String(row.id))) return true;
          const cid =
            row.client_id != null && String(row.client_id).trim() !== ""
              ? String(row.client_id)
              : null;
          if (
            cid &&
            userClientIds.has(cid) &&
            dashboardPublishedStatusFromRow(row) === "Publicado"
          ) {
            return true;
          }
          return false;
        });

        const mappedList: Dashboard[] = filteredRows.map((row) => {
          const base = mapRowToDashboard(row);
          if (row.user_id === user.id) return base;
          const accessClientIds = accessClientIdsByDashboardId.get(String(row.id));
          if (!accessClientIds || accessClientIds.size === 0) return base;
          const currentClientId = base.clientId;
          if (currentClientId && userClientIds.has(currentClientId)) return base;
          return {
            ...base,
            clientId: Array.from(accessClientIds)[0],
          };
        });
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
