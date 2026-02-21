"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import postgres from "postgres";

// Lista de clientes para filtros (id + nombre)
export async function getClientsList() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: prof } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", user.id)
    .single();
  if ((prof as { app_role?: string })?.app_role !== "APP_ADMIN") return [];

  const adminClient = createServiceRoleClient();
  const { data: rows, error } = await adminClient
    .from("clients")
    .select("id, company_name, individual_full_name")
    .order("company_name", { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) {
    console.error("getClientsList:", error);
    return [];
  }
  return (rows ?? []).map((r: { id: string; company_name?: string | null; individual_full_name?: string | null }) => ({
    id: r.id,
    name: r.company_name || r.individual_full_name || "Sin nombre",
  }));
}

// Lista de todos los ETLs para la vista Admin (bypasea RLS para que el admin vea todos)
export async function getEtlsAdmin(options?: { clientId?: string | null }) {
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
  let query = adminClient
    .from("etl")
    .select("*")
    .order("created_at", { ascending: false });
  if (options?.clientId != null && options.clientId !== "") {
    query = query.eq("client_id", options.clientId);
  }
  const { data: rows, error } = await query;

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

/** Detalle de un ETL para vista previa (solo lectura). Incluye layout.guided_config. */
export async function getEtlForPreview(etlId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado", data: null };

  const { data: prof } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", user.id)
    .single();
  if ((prof as { app_role?: string })?.app_role !== "APP_ADMIN")
    return { ok: false, error: "Solo administradores", data: null };

  const adminClient = createServiceRoleClient();
  const { data: row, error } = await adminClient
    .from("etl")
    .select("id, title, name, description, status, published, created_at, output_table, user_id, client_id, layout")
    .eq("id", etlId)
    .single();

  if (error || !row) {
    return { ok: false, error: error?.message ?? "ETL no encontrado", data: null };
  }

  let ownerName: string | null = null;
  if ((row as { user_id?: string }).user_id) {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("id", (row as { user_id: string }).user_id)
      .single();
    ownerName = (profile as { full_name?: string | null })?.full_name ?? null;
  }

  let clientName: string | null = null;
  if ((row as { client_id?: string | null }).client_id) {
    const { data: client } = await adminClient
      .from("clients")
      .select("company_name, individual_full_name")
      .eq("id", (row as { client_id: string }).client_id)
      .single();
    clientName = (client as { company_name?: string | null; individual_full_name?: string | null })
      ?.company_name || (client as { individual_full_name?: string | null })?.individual_full_name ?? null;
  }

  const layout = (row as { layout?: { guided_config?: unknown } })?.layout;
  const guidedConfig = layout?.guided_config && typeof layout.guided_config === "object" ? layout.guided_config as Record<string, unknown> : null;

  return {
    ok: true,
    data: {
      id: (row as { id: string }).id,
      title: (row as { title?: string }).title ?? (row as { name?: string }).name ?? "Sin título",
      name: (row as { name?: string }).name,
      description: (row as { description?: string | null }).description ?? "",
      status: (row as { status?: string }).status ?? "Borrador",
      published: (row as { published?: boolean }).published,
      created_at: (row as { created_at?: string }).created_at,
      output_table: (row as { output_table?: string | null }).output_table,
      ownerName,
      clientName,
      guidedConfig,
    },
    error: null,
  };
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
    .select("output_table, layout")
    .eq("id", etlId)
    .single();

  let targetTableName: string | undefined;
  if (etl?.output_table) {
    targetTableName = etl.output_table;
  } else {
    const layout = etl?.layout as { widgets?: { type?: string; end?: { target?: { table?: string } } }[] } | null | undefined;
    const widgets = Array.isArray(layout?.widgets) ? layout.widgets : [];
    const endNode = widgets.find((w) => w.type === "end");
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
