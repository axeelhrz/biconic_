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
  if (!user) return { ok: false, error: "No autorizado", data: [], owners: {}, clients: {} };

  const { data: prof } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", user.id)
    .single();
  const isAdmin = (prof as any)?.app_role === "APP_ADMIN";
  if (!isAdmin) return { ok: false, error: "Solo administradores", data: [], owners: {}, clients: {} };

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
    return { ok: false, error: error.message, data: [], owners: {}, clients: {} };
  }

  const ownerIds = Array.from(new Set((rows ?? []).map((r: { user_id?: string }) => r.user_id).filter(Boolean))) as string[];
  const clientIds = Array.from(new Set((rows ?? []).map((r: { client_id?: string | null }) => r.client_id).filter(Boolean))) as string[];
  let owners: Record<string, string | null> = {};
  let clients: Record<string, string | null> = {};
  if (ownerIds.length > 0) {
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, full_name")
      .in("id", ownerIds);
    owners = Object.fromEntries((profiles ?? []).map((p: { id: string; full_name?: string | null }) => [p.id, p.full_name ?? null]));
  }
  if (clientIds.length > 0) {
    const { data: clientRows } = await adminClient
      .from("clients")
      .select("id, company_name, individual_full_name")
      .in("id", clientIds);
    clients = Object.fromEntries(
      (clientRows ?? []).map((c: { id: string; company_name?: string | null; individual_full_name?: string | null }) => [
        c.id,
        (c.company_name || c.individual_full_name) ?? null,
      ])
    );
  }

  // Última ejecución por ETL desde etl_runs_log (la más reciente por started_at)
  const etlIds = (rows ?? []).map((r: { id: string }) => String(r.id)).filter(Boolean);
  let lastRunByEtlId: Record<string, string> = {};
  if (etlIds.length > 0) {
    const { data: runs } = await adminClient
      .from("etl_runs_log")
      .select("etl_id, completed_at, started_at")
      .in("etl_id", etlIds)
      .order("started_at", { ascending: false });
    for (const run of runs ?? []) {
      const id = run.etl_id as string | null;
      if (id && lastRunByEtlId[id] == null)
        lastRunByEtlId[id] = (run.completed_at as string | null) ?? (run.started_at as string);
    }
  }

  const enrichedRows = (rows ?? []).map((r: { id: string; created_at?: string | null }) => ({
    ...r,
    lastExecution: lastRunByEtlId[String(r.id)] ?? null,
    createdAt: r.created_at ?? null,
  }));

  return { ok: true, data: enrichedRows as unknown[], owners, clients, error: null };
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
    .select("id, title, name, status, published, created_at, output_table, user_id, client_id, layout")
    .eq("id", etlId)
    .single();

  if (error || !row) {
    return { ok: false, error: error?.message ?? "ETL no encontrado", data: null };
  }

  const r = row as {
    id: string;
    title?: string | null;
    name?: string | null;
    status?: string | null;
    published?: boolean;
    created_at?: string | null;
    output_table?: string | null;
    user_id?: string | null;
    client_id?: string | null;
    layout?: { guided_config?: unknown } | null;
  };

  let ownerName: string | null = null;
  if (r.user_id) {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("id", r.user_id)
      .single();
    ownerName = (profile as { full_name?: string | null })?.full_name ?? null;
  }

  let clientName: string | null = null;
  if (r.client_id) {
    const { data: client } = await adminClient
      .from("clients")
      .select("company_name, individual_full_name")
      .eq("id", r.client_id)
      .single();
    const c = client as { company_name?: string | null; individual_full_name?: string | null } | null;
    clientName = c?.company_name?.trim() || c?.individual_full_name?.trim() || null;
  }

  const layout = r.layout;
  const guidedConfig = layout?.guided_config && typeof layout.guided_config === "object" ? layout.guided_config as Record<string, unknown> : null;

  return {
    ok: true,
    data: {
      id: r.id,
      title: r.title ?? r.name ?? "Sin título",
      name: r.name ?? undefined,
      description: "",
      status: r.status ?? "Borrador",
      published: r.published ?? false,
      created_at: r.created_at ?? undefined,
      output_table: r.output_table ?? undefined,
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
