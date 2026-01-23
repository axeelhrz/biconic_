"use server";

import { createClient } from "@/lib/supabase/server";

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
