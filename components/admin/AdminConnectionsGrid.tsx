"use client";
import { useEffect, useState } from "react";
import DatabaseConnectionCard, { Connection } from "@/components/connections/ConnectionsCard";
import { createClient } from "@/lib/supabase/client";

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

interface AdminConnectionsGridProps {
  searchQuery?: string;
  onConfigure?: (id: string) => void;
  onDelete?: (id: string, title?: string) => void;
}

export default function AdminConnectionsGrid({
  searchQuery = "",
  onConfigure,
  onDelete,
}: AdminConnectionsGridProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    async function loadConnections() {
      console.log("[AdminGrid] 1. Iniciando carga de conexiones...");
      
      try {
        setLoading(true);
        
        // 1. Fetch de conexiones
        console.log("[AdminGrid] 2. Consultando tabla 'connections'...");
        const { data, error } = await supabase
          .from("connections")
          .select(
            "id, name, type, db_host, db_name, updated_at, original_file_name, client_id, user_id"
          );

        if (error) {
          console.error("[AdminGrid] ❌ Error en query connections:", error);
          throw error;
        }

        console.log(`[AdminGrid] 3. Conexiones encontradas: ${data?.length || 0}`, data);

        const rows = (data as SupabaseConnectionRow[]) ?? [];

        // 2. Fetch creators (users) & owners (clients)
        const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
        const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean))) as string[];
        
        let userById = new Map<string, { full_name: string | null }>();
        let clientById = new Map<string, { id: string; company_name: string | null }>();

        // Fetch users
        if (userIds.length > 0) {
            const { data: users, error: userError } = await supabase
              .from("profiles")
              .select("id, full_name")
              .in("id", userIds);
            
            if (userError) console.error("[AdminGrid] ⚠️ Error buscando profiles:", userError);
            userById = new Map((users ?? []).map((u) => [u.id, u]));
        }

        // Fetch clients
        if (clientIds.length > 0) {
             const { data: clients, error: clientError } = await supabase
                .from("clients")
                .select("id, company_name")
                .in("id", clientIds);

             if (clientError) console.error("[AdminGrid] ⚠️ Error buscando clients:", clientError);
             clientById = new Map((clients ?? []).map((c) => [c.id, c]));
        }


        // 3. Cargar metadatos
        let metaByConnId = new Map<string, DataTableMetaRow>();
        if (rows.length > 0) {
          const ids = rows.map((r) => r.id);
          console.log("[AdminGrid] 5. Buscando metadatos en 'data_tables' para:", ids);
          
          const { data: metas, error: metaErr } = await supabase
            .from("data_tables")
            .select(
              "id, connection_id, import_status, updated_at, total_rows, physical_table_name"
            )
            .in("connection_id", ids);

          if (metaErr) {
             console.error("[AdminGrid] ❌ Error data_tables:", metaErr);
             throw metaErr;
          }

          console.log(`[AdminGrid] 6. Metadatos encontrados: ${metas?.length || 0}`, metas);

          (metas as DataTableMetaRow[] | null)?.forEach((m) => {
            metaByConnId.set(m.connection_id, m);
          });
        }

        const mapType = (t: string) => {
          switch (t) {
            case "mysql": return "MySQL";
            case "postgres":
            case "postgresql": return "PostgreSQL";
            case "excel_file":
            case "excel": return "Excel";
            default: return t || "Desconocido";
          }
        };

        const mapStatus = (importStatus?: string): Connection["status"] => {
          switch (importStatus) {
            case "completed":
            case "success": return "Conectado";
            case "failed":
            case "error": return "Error";
            case "pending":
            case "processing":
            case "downloading_file":
            case "creating_table":
            case "inserting_rows":
              return "Procesando";
            default: return "Desconectado";
          }
        };

        // 4. Mapeo final
        const mappedConnections: Connection[] = rows.map((row) => {
          const meta = metaByConnId.get(row.id);
          const isExcel = row.type === "excel_file" || row.type === "excel";
          // const ownerProfile = row.user_id ? ownerById.get(row.user_id) : undefined; 
          
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
            creator: row.user_id ? { fullName: userById.get(row.user_id)?.full_name ?? null } : undefined,
            client: row.client_id ? { 
                id: row.client_id,
                companyName: clientById.get(row.client_id)?.company_name ?? "Cliente Desconocido",
            } : undefined,
          };
        });

        console.log("[AdminGrid] ✅ Mapeo finalizado. Total:", mappedConnections.length, mappedConnections);

        if (isMounted) {
          setConnections(mappedConnections);
          setError(null);
        }
      } catch (err: any) {
        console.error("[AdminGrid] 💀 Error CRÍTICO en loadConnections:", err);
        if (isMounted) {
          setError(err?.message ?? "Error cargando las conexiones");
          setConnections([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadConnections();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="box-border flex w-full max-w-[310px] animate-pulse flex-col gap-5 rounded-[25px] border p-5"
            style={{
              background: "var(--platform-surface)",
              borderColor: "var(--platform-border)",
            }}
          >
            <div className="flex items-center gap-[15px]">
              <div className="h-10 w-10 flex-shrink-0 rounded-full" style={{ background: "var(--platform-surface-hover)" }} />
              <div className="w-full space-y-2">
                <div className="h-4 w-3/4 rounded" style={{ background: "var(--platform-surface-hover)" }} />
                <div className="h-3 w-1/2 rounded" style={{ background: "var(--platform-surface-hover)" }} />
              </div>
            </div>
            <div className="h-4 w-1/4 rounded-full" style={{ background: "var(--platform-surface-hover)" }} />
            <div className="space-y-4">
              <div className="h-8 w-full rounded" style={{ background: "var(--platform-surface-hover)" }} />
              <div className="h-8 w-full rounded" style={{ background: "var(--platform-surface-hover)" }} />
              <div className="h-8 w-full rounded" style={{ background: "var(--platform-surface-hover)" }} />
            </div>
            <div className="mt-2 flex items-center gap-2.5">
              <div className="h-8 flex-grow rounded-full" style={{ background: "var(--platform-surface-hover)" }} />
              <div className="h-6 w-6 rounded" style={{ background: "var(--platform-surface-hover)" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border p-4 text-sm"
        style={{
          borderColor: "var(--platform-danger)",
          background: "rgba(248,113,113,0.1)",
          color: "var(--platform-danger)",
        }}
      >
        Error: {error}
      </div>
    );
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredConnections = connections.filter((conn) => {
    if (!normalizedQuery) return true;
    return (
      conn.title.toLowerCase().includes(normalizedQuery) ||
      conn.host.toLowerCase().includes(normalizedQuery) ||
      conn.databaseName.toLowerCase().includes(normalizedQuery)
    );
  });

  if (connections.length === 0) {
    return (
      <div
        className="rounded-xl border p-6 text-center text-sm"
        style={{
          borderColor: "var(--platform-border)",
          background: "var(--platform-surface)",
          color: "var(--platform-fg-muted)",
        }}
      >
        No se encontraron conexiones (Array vacío). Revisa la consola.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filteredConnections.map((connection) => (
        <DatabaseConnectionCard
          key={connection.id}
          connection={connection}
          onConfigure={onConfigure}
          onDelete={onDelete}
        />
      ))}
      {filteredConnections.length === 0 && (
        <div
          className="col-span-full rounded-xl border p-6 text-center text-sm"
          style={{
            borderColor: "var(--platform-border)",
            background: "var(--platform-surface)",
            color: "var(--platform-fg-muted)",
          }}
        >
          No se encontraron conexiones que coincidan con tu búsqueda.
        </div>
      )}
    </div>
  );
}