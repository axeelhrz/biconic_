"use server";

import { createClient } from "@/lib/supabase/server";
import { Connection } from "@/components/connections/ConnectionsCard";

type SupabaseConnectionRow = {
  id: string;
  name: string;
  type: string;
  db_host: string | null;
  db_name: string | null;
  updated_at: string;
  original_file_name: string | null;
  client_id?: string | null;
  user_id?: string;
};

type DataTableMetaRow = {
  id: string;
  connection_id: string;
  import_status: string;
  updated_at: string;
  total_rows: number | null;
  physical_table_name: string | null;
};

export async function getConnections(): Promise<Connection[]> {
  const supabase = await createClient();
  
  // 1. Obtener usuario autenticado
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  // 2. Consulta Principal: DEJAR QUE RLS HAGA EL TRABAJO
  // No usamos .eq("user_id", user.id) ni lógica manual compleja.
  // La base de datos filtrará automáticamente según las políticas que creaste.
  const { data: allConnections, error } = await supabase
    .from("connections")
    .select(
      "id, name, type, db_host, db_name, updated_at, original_file_name, client_id, user_id"
    )
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching connections:", error);
    throw new Error("Error al cargar las conexiones");
  }

  console.log("SERVER ACTION: Raw connections count:", allConnections?.length);
  const uniqueRows = (allConnections as SupabaseConnectionRow[]) || [];

  if (uniqueRows.length === 0) {
    return [];
  }

  // 3. Obtener metadatos (data_tables) para las conexiones encontradas
  const ids = uniqueRows.map((r) => r.id);
  const { data: metas } = await supabase
    .from("data_tables")
    .select(
      "id, connection_id, import_status, updated_at, total_rows, physical_table_name"
    )
    .in("connection_id", ids);

  const metaByConnId = new Map<string, DataTableMetaRow>();
  if (metas) {
    (metas as DataTableMetaRow[]).forEach((m) => {
      metaByConnId.set(m.connection_id, m);
    });
  }

  // 4. Obtener información de los Dueños (Profiles)
  // Extraemos los user_id únicos para hacer una sola consulta eficiente
  const ownerIds = Array.from(
    new Set(uniqueRows.map((r) => r.user_id).filter(Boolean))
  ) as string[];

  let ownerById = new Map<string, { full_name: string | null }>();

  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ownerIds);

    if (owners) {
      owners.forEach((o) => ownerById.set(o.id, { full_name: o.full_name }));
    }
  }

  // Helpers de mapeo visual
  const mapType = (t: string) => {
    switch (t) {
      case "mysql":
        return "MySQL";
      case "postgres":
      case "postgresql":
        return "PostgreSQL";
      case "firebird":
        return "Firebird";
      case "excel_file":
      case "excel":
        return "Excel";
      default:
        return t || "Desconocido";
    }
  };

  const mapStatus = (importStatus?: string): Connection["status"] => {
    switch (importStatus) {
      case "completed":
      case "success":
        return "Conectado";
      case "failed":
      case "error":
        return "Error";
      case "pending":
      case "processing":
      case "downloading_file":
      case "creating_table":
      case "inserting_rows":
        return "Procesando";
      default:
        return "Desconectado";
    }
  };

  // 5. Retornar datos mapeados
  const result = uniqueRows.map((row) => {
    const meta = metaByConnId.get(row.id);
    const isExcel = row.type === "excel_file" || row.type === "excel";
    
    return {
      id: row.id,
      title: row.name ?? "Conexión Sin Título",
      type: mapType(row.type),
      status: mapStatus(meta?.import_status),
      host: isExcel ? "Archivo" : row.db_host ?? "No especificado",
      databaseName: isExcel
        ? row.original_file_name ?? "No especificado"
        : row.db_name ?? "No especificada",
      lastSync:
        meta?.updated_at || row.updated_at
          ? new Date(meta?.updated_at || row.updated_at).toLocaleString()
          : "Nunca",
      clientId: row.client_id ?? "",
      dataTableId: meta?.id,
      importStatus: meta?.import_status,
      owner: row.user_id
        ? { fullName: ownerById.get(row.user_id)?.full_name ?? "Desconocido" }
        : undefined,
    };
  });
  console.log("SERVER ACTION: Returned connections:", result.length);
  return result;
}