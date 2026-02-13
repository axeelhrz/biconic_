"use server";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type DashboardInsert = Database["public"]["Tables"]["dashboard"]["Insert"];

export async function searchClients(query: string) {
  const supabase = await createClient();
  
  let dbQuery = supabase
    .from("clients")
    .select("id, company_name, individual_full_name")
    .limit(20);

  if (query) {
    dbQuery = dbQuery.or(
      `company_name.ilike.%${query}%,individual_full_name.ilike.%${query}%`
    );
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("Error searching clients:", error);
    return [];
  }

  return data.map((c) => ({
    id: c.id,
    name: c.company_name || c.individual_full_name || "Sin nombre",
  }));
}

export async function createDashboardAdmin(
  clientId: string,
  title: string = "Nuevo Dashboard",
  etlIdOrIds?: string | string[] | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const etlIds = Array.isArray(etlIdOrIds)
    ? etlIdOrIds
    : etlIdOrIds
    ? [etlIdOrIds]
    : [];
  const firstEtlId = etlIds[0] ?? null;

  const insertPayload: DashboardInsert = {
    client_id: clientId,
    user_id: user.id,
    title: title,
    layout: { widgets: [], zoom: 1, grid: 20 },
    ...(firstEtlId ? { etl_id: firstEtlId } : {}),
  };

  const { data, error } = await supabase
    .from("dashboard")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    console.error("Error creating Dashboard:", error);
    return { ok: false, error: error.message };
  }

  if (etlIds.length > 0) {
    const { error: srcError } = await supabase.from("dashboard_data_sources").insert(
      etlIds.map((etl_id, i) => ({
        dashboard_id: data.id,
        etl_id,
        alias: i === 0 ? "Principal" : `Fuente ${i + 1}`,
        sort_order: i,
      }))
    );
    if (srcError) console.error("Error adding dashboard_data_sources:", srcError);
  }

  return { ok: true, dashboardId: data.id };
}

export async function searchEtls(query: string) {
  const supabase = await createClient();
  
  let dbQuery = supabase
    .from("etl")
    .select("id, title, name")
    .limit(20);

  if (query) {
    dbQuery = dbQuery.or(
      `title.ilike.%${query}%,name.ilike.%${query}%`
    );
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("Error searching etls:", error);
    return [];
  }

  return data.map((e) => ({
    id: e.id,
    title: e.title || e.name || "Sin título",
  }));
}

import { verifyDashboardEditAccess } from "@/lib/admin/dashboard-security";

export async function updateDashboardEtl(dashboardId: string, etlId: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canEdit) return { ok: false, error: "Forbidden: You don't have permission to edit this dashboard" };

  const { error } = await supabase
    .from("dashboard")
    .update({ etl_id: etlId })
    .eq("id", dashboardId);

  if (error) {
    console.error("Error updating dashboard etl:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/** Listar fuentes de datos (ETLs) del dashboard */
export async function getDashboardDataSources(dashboardId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canEdit) return { ok: false, error: "Forbidden" };

  const { data, error } = await supabase
    .from("dashboard_data_sources")
    .select("id, etl_id, alias, sort_order")
    .eq("dashboard_id", dashboardId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching dashboard data sources:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, sources: data ?? [] };
}

/** Añadir una fuente de datos (ETL) al dashboard */
export async function addDashboardDataSource(
  dashboardId: string,
  etlId: string,
  alias: string = "Nueva fuente"
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canEdit) return { ok: false, error: "Forbidden" };

  const { data: existing } = await supabase
    .from("dashboard_data_sources")
    .select("sort_order")
    .eq("dashboard_id", dashboardId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = (existing as any)?.sort_order ?? -1;

  const { error } = await supabase.from("dashboard_data_sources").insert({
    dashboard_id: dashboardId,
    etl_id: etlId,
    alias: alias.trim() || "Fuente",
    sort_order: sort_order + 1,
  });

  if (error) {
    console.error("Error adding dashboard data source:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Quitar una fuente de datos del dashboard */
export async function removeDashboardDataSource(dashboardId: string, sourceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canEdit) return { ok: false, error: "Forbidden" };

  const { error } = await supabase
    .from("dashboard_data_sources")
    .delete()
    .eq("id", sourceId)
    .eq("dashboard_id", dashboardId);

  if (error) {
    console.error("Error removing dashboard data source:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Actualizar alias de una fuente */
export async function updateDashboardDataSourceAlias(
  dashboardId: string,
  sourceId: string,
  alias: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canEdit) return { ok: false, error: "Forbidden" };

  const { error } = await supabase
    .from("dashboard_data_sources")
    .update({ alias: alias.trim() || "Fuente" })
    .eq("id", sourceId)
    .eq("dashboard_id", dashboardId);

  if (error) {
    console.error("Error updating dashboard data source alias:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function updateDashboardTitle(dashboardId: string, title: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  // Verify access
  const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canEdit) return { ok: false, error: "Forbidden: You don't have permission to edit this dashboard" };

  const { error } = await supabase
    .from("dashboard")
    .update({ title })
    .eq("id", dashboardId);

  if (error) {
    console.error("Error updating dashboard title:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

// === Versioning Actions ===

export async function saveDashboardVersion(dashboardId: string, versionName: string | null = null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  // Permission check
  const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canEdit) return { ok: false, error: "Forbidden: You don't have permission to save versions for this dashboard" };

  // Get current dashboard state (needed for the content, not permission)
  const { data: dashboard, error: fetchError } = await supabase
      .from("dashboard")
      .select("layout, global_filters_config")
      .eq("id", dashboardId)
      .single();
  
  if (fetchError || !dashboard) return { ok: false, error: "Dashboard not found" };

  // Insert version
  const { error: insertError } = await supabase
      .from("dashboard_versions")
      .insert({
          dashboard_id: dashboardId,
          version_name: versionName || `Version ${new Date().toLocaleString()}`,
          layout: dashboard.layout,
          global_filters_config: dashboard.global_filters_config,
          created_by: user.id
      });
  
  if (insertError) {
      console.error("Error saving version:", insertError);
      return { ok: false, error: insertError.message };
  }
  return { ok: true };
}

export async function getDashboardHistory(dashboardId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  // Verify access just in case (though reading history might be looser, staying strict for now)
  const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
  // Optional: Could return empty list instead of error, but let's be explicit
  if (!canEdit) return { ok: false, error: "Forbidden" };

  const { data, error } = await supabase
      .from("dashboard_versions")
      .select("id, version_name, created_at, created_by")
      .eq("dashboard_id", dashboardId)
      .order("created_at", { ascending: false });
  
  if (error) {
      console.error("Error fetching history:", error);
      return { ok: false, error: error.message };
  }
  return { ok: true, versions: data };
}

export async function restoreVersion(versionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  // Get version data
  const { data: version, error: fetchError } = await supabase
      .from("dashboard_versions")
      .select("dashboard_id, layout, global_filters_config")
      .eq("id", versionId)
      .single();
  
  if (fetchError || !version) return { ok: false, error: "Version not found" };

  // Verify access to the TARGET dashboard
  const canEdit = await verifyDashboardEditAccess(version.dashboard_id, user.id);
  if (!canEdit) return { ok: false, error: "Forbidden: You don't have permission to modify this dashboard" };

  // Update dashboard
  const { error: updateError } = await supabase
      .from("dashboard")
      .update({
          layout: version.layout,
          global_filters_config: version.global_filters_config
      })
      .eq("id", version.dashboard_id);
  
  if (updateError) {
      console.error("Error restoring version:", updateError);
      return { ok: false, error: updateError.message };
  }
  return { ok: true };
}

export async function deleteDashboard(dashboardId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  // Verify access (reuse edit access for delete for now, or check ownership)
  // Usually delete requires higher privs or ownership. 
  // For admin, we assume they can delete if they can edit/access this admin route.
  const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canEdit) return { ok: false, error: "Forbidden: You don't have permission to delete this dashboard" };

  const { error } = await supabase
    .from("dashboard")
    .delete()
    .eq("id", dashboardId);

  if (error) {
    console.error("Error deleting dashboard:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
