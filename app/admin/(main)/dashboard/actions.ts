"use server";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import {
  deleteDashboardFromDb,
  listAdminDashboardsForGridFromDb,
  publishDashboardFromDb,
  searchClientsFromDb,
  verifyDashboardEditAccessFromDb,
} from "@/lib/admin/dashboard-repository";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
import type { Dashboard } from "@/components/dashboard/DashboardCard";
import { dashboardPublishedStatusFromRow } from "@/lib/dashboard/dashboardPublishedFromRow";
import { resolveDashboardCoverImageUrl } from "@/lib/dashboard/dashboardCoverImage";

type DashboardInsert = Database["public"]["Tables"]["dashboard"]["Insert"];

export async function listAdminDashboardsForGrid(): Promise<Dashboard[]> {
  if (shouldUseOwnBackend()) {
    try {
      return await listAdminDashboardsForGridFromDb();
    } catch (err) {
      console.error("Error listing dashboards from DB:", err);
      return [];
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("dashboard").select("*");
  if (error) {
    console.error("Error listing dashboards:", error);
    return [];
  }

  const rows = Array.isArray(data) ? data : [];
  const ownerIds = Array.from(new Set(rows.map((r: { user_id?: string }) => r.user_id).filter(Boolean))) as string[];
  const clientIds = Array.from(new Set(rows.map((r: { client_id?: string | null }) => r.client_id).filter(Boolean))) as string[];
  let ownerById = new Map<string, { full_name: string | null }>();
  let clientById = new Map<string, string>();

  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ownerIds);
    const ownerList = Array.isArray(owners) ? owners : owners ? [owners] : [];
    ownerById = new Map(ownerList.map((o: { id: string; full_name: string | null }) => [o.id, o]));
  }

  if (clientIds.length > 0) {
    const { data: clientRows } = await supabase
      .from("clients")
      .select("id, company_name, individual_full_name, type")
      .in("id", clientIds);
    clientById = new Map(
      (clientRows ?? []).map((c: { id: string; company_name?: string | null; individual_full_name?: string | null; type?: string | null }) => [
        c.id,
        c.company_name?.trim() || c.individual_full_name?.trim() || "Cliente",
      ])
    );
  }

  return rows.map((row: Record<string, unknown>) => {
    const userId = row.user_id as string | undefined;
    const ownerProfile = userId ? ownerById.get(userId) : undefined;
    const cid = row.client_id != null ? String(row.client_id) : undefined;
    return {
      id: String(row.id),
      title: String(row.title ?? row.name ?? "Sin título"),
      imageUrl: resolveDashboardCoverImageUrl({
        layout: row.layout,
        image_url: row.image_url,
        thumbnail_url: row.thumbnail_url,
      }),
      status: dashboardPublishedStatusFromRow(row as { published?: boolean; visibility?: string; status?: string }),
      description: String(row.description ?? ""),
      views: typeof row.views === "number" ? row.views : 0,
      owner: { fullName: ownerProfile?.full_name ?? "Desconocido" },
      clientId: cid,
      clientLabel: cid ? clientById.get(cid) : undefined,
      ownerId: userId,
      layout: (row.layout as Dashboard["layout"]) ?? undefined,
    };
  });
}

export async function searchClients(query: string) {
  if (shouldUseOwnBackend()) {
    try {
      return await searchClientsFromDb(query);
    } catch (err) {
      console.error("Error searching clients:", err);
      return [];
    }
  }

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

  const rows = Array.isArray(data) ? data : [];
  return rows.map((c: any) => ({
    id: c.id,
    name: c.company_name || c.individual_full_name || "Sin nombre",
  }));
}

export async function createDashboardAdmin(
  clientId: string,
  title: string = "Nuevo Dashboard",
  datasetIdOrIds?: string | string[] | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const datasetIds = Array.isArray(datasetIdOrIds)
    ? datasetIdOrIds.map((id) => String(id).trim()).filter(Boolean)
    : datasetIdOrIds
      ? [String(datasetIdOrIds).trim()].filter(Boolean)
      : [];

  if (datasetIds.length === 0) {
    return {
      ok: false,
      error: "Seleccioná al menos un dataset como fuente de datos del dashboard.",
    };
  }

  const { data: datasetRows, error: dsErr } = await supabase
    .from("dataset")
    .select("id, etl_id, name")
    .in("id", datasetIds);

  if (dsErr) {
    console.error("Error loading datasets for dashboard create:", dsErr);
    return { ok: false, error: dsErr.message };
  }

  const datasets = Array.isArray(datasetRows) ? datasetRows : [];
  if (datasets.length !== datasetIds.length) {
    return { ok: false, error: "Uno o más datasets no existen o no están disponibles." };
  }

  const orderedDatasets = datasetIds
    .map((id) => datasets.find((d) => String(d.id) === id))
    .filter((d): d is (typeof datasets)[number] => !!d);

  const etlIdsNeeded = [...new Set(orderedDatasets.map((d) => String(d.etl_id ?? "")).filter(Boolean))];
  if (etlIdsNeeded.length === 0) {
    return { ok: false, error: "Los datasets seleccionados no tienen un ETL asociado." };
  }

  const { data: etlRows, error: etlErr } = await supabase
    .from("etl")
    .select("id, client_id, title, name")
    .in("id", etlIdsNeeded);

  if (etlErr) {
    console.error("Error validating ETL ownership for dashboard create:", etlErr);
    return { ok: false, error: etlErr.message };
  }

  const etls = Array.isArray(etlRows) ? etlRows : [];
  const foreign = etls.find((e) => String(e.client_id ?? "") !== String(clientId));
  if (foreign || etls.length !== etlIdsNeeded.length) {
    return {
      ok: false,
      error: "Solo podés usar datasets del cliente seleccionado.",
    };
  }

  const firstEtlId = String(orderedDatasets[0]?.etl_id ?? "") || null;
  const insertPayload: DashboardInsert = {
    client_id: clientId,
    user_id: user.id,
    title: title,
    layout: {
      widgets: [],
      zoom: 1,
      grid: 20,
      boundDatasetId: datasetIds[0],
      boundDatasetIds: datasetIds,
    },
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

  // Una fuente por dataset (aunque compartan ETL): independencia total a nivel Dataset.
  const { error: srcError } = await supabase.from("dashboard_data_sources").insert(
    orderedDatasets.map((ds, i) => {
      const aliasFromDs = String(ds.name ?? "").trim();
      return {
        dashboard_id: data.id,
        etl_id: String(ds.etl_id),
        dataset_id: String(ds.id),
        alias: aliasFromDs || (i === 0 ? "Principal" : `Fuente ${i + 1}`),
        sort_order: i,
      };
    })
  );
  if (srcError) {
    console.error("Error adding dashboard_data_sources:", srcError);
    await supabase.from("dashboard").delete().eq("id", data.id);
    return { ok: false, error: `No se pudo vincular el dataset: ${srcError.message}` };
  }

  return { ok: true, dashboardId: data.id };
}

export type DatasetSearchResult = {
  id: string;
  name: string;
  etlId: string;
  etlTitle: string;
};

/** Datasets del cliente (vía etl.client_id). */
export async function searchDatasetsForClient(
  clientId: string,
  query: string = ""
): Promise<DatasetSearchResult[]> {
  const trimmedClient = String(clientId ?? "").trim();
  if (!trimmedClient) return [];

  const supabase = await createClient();
  const { data: etlRows, error: etlErr } = await supabase
    .from("etl")
    .select("id, title, name")
    .eq("client_id", trimmedClient);

  if (etlErr) {
    console.error("Error listing client ETLs for datasets:", etlErr);
    return [];
  }

  const etls = Array.isArray(etlRows) ? etlRows : [];
  if (etls.length === 0) return [];

  const etlTitleById = new Map(
    etls.map((e) => [
      String(e.id),
      String(e.title || e.name || "Sin título").trim() || "Sin título",
    ])
  );
  const etlIds = etls.map((e) => String(e.id));

  let dsQuery = supabase
    .from("dataset")
    .select("id, etl_id, name, updated_at")
    .in("etl_id", etlIds)
    .order("updated_at", { ascending: false })
    .limit(50);

  const q = query.trim();
  if (q) {
    dsQuery = dsQuery.ilike("name", `%${q}%`);
  }

  const { data: dsRows, error: dsErr } = await dsQuery;
  if (dsErr) {
    console.error("Error searching datasets for client:", dsErr);
    return [];
  }

  return (Array.isArray(dsRows) ? dsRows : []).map((row) => {
    const etlId = String(row.etl_id ?? "");
    const name = String(row.name ?? "").trim();
    const etlTitle = etlTitleById.get(etlId) ?? "ETL";
    return {
      id: String(row.id),
      name: name || `Dataset · ${etlTitle}`,
      etlId,
      etlTitle,
    };
  });
}

/** Semilla al crear dashboard desde un ETL (`?create=1&etlId=`). */
export async function getCreateDashboardSeedFromEtl(etlId: string): Promise<{
  clientId: string | null;
  clientName: string | null;
  datasets: DatasetSearchResult[];
} | null> {
  const id = String(etlId ?? "").trim();
  if (!id) return null;

  const supabase = await createClient();
  const { data: etl, error } = await supabase
    .from("etl")
    .select("id, client_id, title, name")
    .eq("id", id)
    .maybeSingle();

  if (error || !etl) {
    console.error("Error loading ETL seed for dashboard create:", error);
    return null;
  }

  const clientId = etl.client_id != null ? String(etl.client_id) : null;
  let clientName: string | null = null;
  if (clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("company_name, individual_full_name, name")
      .eq("id", clientId)
      .maybeSingle();
    clientName =
      String(
        (client as { company_name?: string | null } | null)?.company_name ??
          (client as { individual_full_name?: string | null } | null)?.individual_full_name ??
          (client as { name?: string | null } | null)?.name ??
          ""
      ).trim() || null;
  }

  const datasets = clientId ? await searchDatasetsForClient(clientId, "") : [];
  const forThisEtl = datasets.filter((d) => d.etlId === id);

  return {
    clientId,
    clientName,
    datasets: forThisEtl.length > 0 ? forThisEtl : datasets,
  };
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

  return data.map((e: any) => ({
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

/** Listar fuentes de datos (datasets) del dashboard */
export async function getDashboardDataSources(dashboardId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canEdit) return { ok: false, error: "Forbidden" };

  const { data, error } = await supabase
    .from("dashboard_data_sources")
    .select("id, etl_id, dataset_id, alias, sort_order")
    .eq("dashboard_id", dashboardId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching dashboard data sources:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, sources: data ?? [] };
}

/** Añadir una fuente de datos por dataset (independiente del ETL). */
export async function addDashboardDataSource(
  dashboardId: string,
  datasetIdOrEtlId: string,
  alias: string = "Nueva fuente"
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canEdit) return { ok: false, error: "Forbidden" };

  const id = String(datasetIdOrEtlId ?? "").trim();
  if (!id) return { ok: false, error: "datasetId requerido" };

  // Preferir dataset; fallback legacy: tratar el id como etl_id.
  let etlId = "";
  let datasetId: string | null = null;
  let aliasResolved = alias.trim() || "Fuente";

  const { data: dsRow } = await supabase
    .from("dataset")
    .select("id, etl_id, name")
    .eq("id", id)
    .maybeSingle();

  if (dsRow?.id) {
    datasetId = String(dsRow.id);
    etlId = String(dsRow.etl_id ?? "");
    const dsName = String(dsRow.name ?? "").trim();
    if (dsName && (!alias.trim() || alias.trim() === "Nueva fuente" || alias.trim() === "Fuente")) {
      aliasResolved = dsName;
    }
  } else {
    etlId = id;
  }

  if (!etlId) return { ok: false, error: "No se pudo resolver el ETL del dataset" };

  if (datasetId) {
    const { data: dup } = await supabase
      .from("dashboard_data_sources")
      .select("id")
      .eq("dashboard_id", dashboardId)
      .eq("dataset_id", datasetId)
      .maybeSingle();
    if (dup?.id) {
      return { ok: false, error: "Ese dataset ya está vinculado al dashboard." };
    }
  }

  const { data: existing } = await supabase
    .from("dashboard_data_sources")
    .select("sort_order")
    .eq("dashboard_id", dashboardId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = (existing as { sort_order?: number } | null)?.sort_order ?? -1;

  const { error } = await supabase.from("dashboard_data_sources").insert({
    dashboard_id: dashboardId,
    etl_id: etlId,
    ...(datasetId ? { dataset_id: datasetId } : {}),
    alias: aliasResolved,
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

/** Publicar o despublicar dashboard para clientes (usa `visibility` en DB). */
export async function publishDashboardAdmin(
  dashboardId: string,
  published: boolean
) {
  if (shouldUseOwnBackend()) {
    try {
      return await publishDashboardFromDb(dashboardId, published);
    } catch (err) {
      console.error("Error publishing dashboard:", err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Error al publicar",
      };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canEdit) {
    return {
      ok: false,
      error: "Forbidden: You don't have permission to edit this dashboard",
    };
  }

  const { error } = await supabase
    .from("dashboard")
    .update({
      published,
      visibility: published ? "public" : "private",
    })
    .eq("id", dashboardId);

  if (error) {
    console.error("Error updating dashboard visibility:", error);
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
  if (shouldUseOwnBackend()) {
    const authUser = await getServerAuthUser();
    if (!authUser?.id) {
      return { ok: false, error: "Unauthorized" };
    }

    const canEdit = await verifyDashboardEditAccessFromDb(
      dashboardId,
      authUser.id,
      authUser.app_role
    );
    if (!canEdit) {
      return {
        ok: false,
        error: "Forbidden: You don't have permission to delete this dashboard",
      };
    }

    try {
      return await deleteDashboardFromDb(dashboardId);
    } catch (err) {
      console.error("Error deleting dashboard:", err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Error al eliminar",
      };
    }
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canEdit) {
    return {
      ok: false,
      error: "Forbidden: You don't have permission to delete this dashboard",
    };
  }

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
