"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import postgres from "postgres";

// Lista de todos los ETLs para la vista Admin (bypasea RLS para que el admin vea todos)
export async function getEtlsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado", data: [], owners: {} };

  const { data: prof } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", user.id)
    .single();
  const isAdmin = (prof as any)?.app_role === "APP_ADMIN";
  if (!isAdmin) return { ok: false, error: "Solo administradores", data: [], owners: {} };

  const adminClient = createServiceRoleClient();
  const { data: rows, error } = await adminClient
    .from("etl")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    console.error("getEtlsAdmin:", error);
    return { ok: false, error: error.message, data: [], owners: {} };
  }

  const ownerIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean))) as string[];
  let owners: Record<string, string | null> = {};
  if (ownerIds.length > 0) {
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, full_name")
      .in("id", ownerIds);
    owners = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.full_name ?? null]));
  }

  return { ok: true, data: (rows ?? []) as any[], owners, error: null };
}

// Search Clients
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

export async function createEtlAdmin(clientId: string, title: string = "Nuevo ETL") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  // Create ETL
  // We assign the current admin as the creator (user_id) but link it to the selected client_id
  const { data, error } = await supabase
    .from("etl")
    .insert({
      client_id: clientId,
      user_id: user.id,
      title: title,
      name: title,
      status: "Borrador",
      published: false,
      layout: { widgets: [], zoom: 1, grid: 20, edges: [] },
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating ETL:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true, etlId: data.id };
}

/** Eliminar ETL desde admin (service role). Refrescar lista tras eliminar. */
export async function deleteEtlAdmin(etlId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado" };

  const { data: prof } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", user.id)
    .single();
  if ((prof as any)?.app_role !== "APP_ADMIN")
    return { ok: false, error: "Solo administradores" };

  const adminClient = createServiceRoleClient();
  const { data: etl } = await adminClient
    .from("etl")
    .select("content, output_table, layout")
    .eq("id", etlId)
    .single();

  let targetTableName: string | undefined;
  if (etl?.output_table) {
    targetTableName = etl.output_table;
  } else {
    const layout = (etl as any)?.layout;
    const widgets = Array.isArray(layout?.widgets) ? layout.widgets : [];
    const endNode = widgets.find((w: any) => w.type === "end");
    targetTableName = endNode?.end?.target?.table;
  }

  if (targetTableName && (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL)) {
    const safeName = targetTableName.replace(/[^a-zA-Z0-9_]/g, "");
    if (safeName) {
      const pg = postgres(process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL!);
      try {
        await pg.unsafe(`DROP TABLE IF EXISTS etl_output."${safeName}"`);
      } catch (err) {
        console.error("Error dropping table:", err);
      } finally {
        await pg.end();
      }
    }
  }

  const { error } = await adminClient.from("etl").delete().eq("id", etlId);
  if (error) {
    console.error("deleteEtlAdmin:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
