"use client";
import { useCallback, useEffect, useState } from "react";
import DatabaseConnectionCard, { Connection } from "@/components/connections/ConnectionsCard";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, Database, Search } from "lucide-react";

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

  const loadConnections = useCallback(async () => {
    const supabase = createClient();
      console.log("[AdminGrid] 1. Iniciando carga de conexiones...");
      
      try {
        setLoading(true);
        
        // 1. Fetch de conexiones
        console.log("[AdminGrid] 2. Consultando tabla 'connections'...");
        const { data, error } = await supabase
          .from("connections")
          .select(
            "id, name, type, db_host, db_name, updated_at, original_file_name, client_id, user_id"
          )
          .order("created_at", { ascending: false });

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
            case "firebird": return "Firebird";
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
            dataTableUpdatedAt: meta?.updated_at,
            importStatus: meta?.import_status,
            creator: row.user_id ? { fullName: userById.get(row.user_id)?.full_name ?? null } : undefined,
            client: row.client_id ? { 
                id: row.client_id,
                companyName: clientById.get(row.client_id)?.company_name ?? "Cliente Desconocido",
            } : undefined,
          };
        });

        console.log("[AdminGrid] ✅ Mapeo finalizado. Total:", mappedConnections.length, mappedConnections);

        setConnections(mappedConnections);
        setError(null);
      } catch (err: any) {
        console.error("[AdminGrid] 💀 Error CRÍTICO en loadConnections:", err);
        setError(err?.message ?? "Error cargando las conexiones");
        setConnections([]);
      } finally {
        setLoading(false);
      }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex w-full flex-col gap-5 rounded-2xl border p-5"
            style={{
              background: "var(--platform-surface)",
              borderColor: "var(--platform-border)",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 flex-shrink-0 rounded-xl" style={{ background: "var(--platform-surface-hover)" }} />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded-lg" style={{ background: "var(--platform-surface-hover)" }} />
                <div className="h-3 w-1/2 rounded-lg" style={{ background: "var(--platform-surface-hover)" }} />
              </div>
            </div>
            <div className="h-5 w-20 rounded-lg" style={{ background: "var(--platform-surface-hover)" }} />
            <div className="space-y-3">
              <div className="h-9 w-full rounded-lg" style={{ background: "var(--platform-surface-hover)" }} />
              <div className="h-9 w-full rounded-lg" style={{ background: "var(--platform-surface-hover)" }} />
              <div className="h-9 w-full rounded-lg" style={{ background: "var(--platform-surface-hover)" }} />
            </div>
            <div className="mt-auto flex items-center gap-2 pt-2">
              <div className="h-9 flex-1 rounded-xl" style={{ background: "var(--platform-surface-hover)" }} />
              <div className="h-9 w-9 rounded-lg" style={{ background: "var(--platform-surface-hover)" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border px-4 py-4 text-sm"
        style={{
          borderColor: "rgba(248,113,113,0.3)",
          background: "var(--platform-surface)",
          color: "var(--platform-danger)",
        }}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(248,113,113,0.15)" }}>
          <AlertCircle className="h-5 w-5" />
        </div>
        <div>
          <p className="font-medium">Error al cargar las conexiones</p>
          <p className="mt-0.5 opacity-90">{error}</p>
        </div>
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
        className="flex flex-col items-center justify-center rounded-2xl border py-16 px-6 text-center"
        style={{
          borderColor: "var(--platform-border)",
          background: "var(--platform-surface)",
        }}
      >
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "var(--platform-bg-elevated)" }}>
          <Database className="h-8 w-8" style={{ color: "var(--platform-muted)" }} />
        </div>
        <h3 className="text-lg font-medium" style={{ color: "var(--platform-fg)" }}>
          Aún no hay conexiones
        </h3>
        <p className="mt-1 max-w-sm text-sm" style={{ color: "var(--platform-fg-muted)" }}>
          Creá tu primera conexión a una base de datos o subí un archivo Excel para empezar.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredConnections.map((connection) => (
          <DatabaseConnectionCard
            key={connection.id}
            connection={connection}
            onConfigure={onConfigure}
            onDelete={onDelete}
            onRefreshConnections={loadConnections}
          />
        ))}
      </div>
      {filteredConnections.length === 0 && (
        <div
          className="flex flex-col items-center justify-center rounded-2xl border py-12 px-6 text-center"
          style={{
            borderColor: "var(--platform-border)",
            background: "var(--platform-surface)",
          }}
        >
          <Search className="mb-3 h-10 w-10" style={{ color: "var(--platform-muted)" }} />
          <h3 className="text-base font-medium" style={{ color: "var(--platform-fg)" }}>
            Sin resultados
          </h3>
          <p className="mt-1 text-sm" style={{ color: "var(--platform-fg-muted)" }}>
            No hay conexiones que coincidan con tu búsqueda. Probá con otro término.
          </p>
        </div>
      )}
    </>
  );
}