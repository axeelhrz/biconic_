"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, CircleDashed } from "lucide-react";

type LogEntry = {
  id: string;
  etl_id: string | null;
  status: "started" | "completed" | "failed";
  started_at: string;
  completed_at: string | null;
  rows_processed: number | null;
  error_message: string | null;
  destination_table_name: string;
  etl_name?: string;
};

interface MonitorsTableProps {
  searchQuery?: string;
  filter?: "all" | "started" | "completed" | "failed";
}

export default function MonitorsTable({
  searchQuery = "",
  filter = "all",
}: MonitorsTableProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    async function loadLogs() {
      try {
        setLoading(true);

        // Fetch logs
        const { data: logsData, error: logsError } = await supabase
          .from("etl_runs_log")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(100);

        if (logsError) throw logsError;

        if (!logsData || logsData.length === 0) {
           if (isMounted) setLogs([]);
           return;
        }

        // Fetch ETL names
        const etlIds = Array.from(
          new Set(logsData.map((l) => l.etl_id).filter(Boolean))
        ) as string[];

        let etlNameMap = new Map<string, string>();

        if (etlIds.length > 0) {
          const { data: etlsData, error: etlsError } = await supabase
            .from("etl")
            .select("id, title, name")
            .in("id", etlIds);

          if (!etlsError && etlsData) {
            etlsData.forEach((etl) => {
              etlNameMap.set(etl.id, etl.title || etl.name || "Sin Nombre");
            });
          }
        }

        const mappedLogs: LogEntry[] = logsData.map((log) => ({
          ...log,
          etl_name: log.etl_id ? etlNameMap.get(log.etl_id) || "Desconocido" : "N/A",
        }));

        if (isMounted) {
          setLogs(mappedLogs);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Error cargando logs");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadLogs();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      searchQuery === "" ||
      log.etl_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.destination_table_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.error_message?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      filter === "all" || log.status === filter;

    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div
        className="w-full rounded-md border p-8 text-center"
        style={{
          borderColor: "var(--platform-border)",
          background: "var(--platform-surface)",
          color: "var(--platform-fg-muted)",
        }}
      >
        Cargando monitores...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="w-full rounded-md border p-4"
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

  return (
    <div
      className="w-full overflow-hidden rounded-xl border shadow-sm"
      style={{
        borderColor: "var(--platform-border)",
        background: "var(--platform-surface)",
      }}
    >
      <Table>
        <TableHeader style={{ background: "var(--platform-bg-elevated)" }}>
          <TableRow style={{ borderColor: "var(--platform-border)" }}>
            <TableHead className="w-[140px]" style={{ color: "var(--platform-fg-muted)" }}>Estado</TableHead>
            <TableHead style={{ color: "var(--platform-fg-muted)" }}>ETL</TableHead>
            <TableHead style={{ color: "var(--platform-fg-muted)" }}>Tabla Destino</TableHead>
            <TableHead style={{ color: "var(--platform-fg-muted)" }}>Inicio</TableHead>
            <TableHead className="text-right" style={{ color: "var(--platform-fg-muted)" }}>Registros</TableHead>
            <TableHead className="w-[30%]" style={{ color: "var(--platform-fg-muted)" }}>Mensaje</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredLogs.length === 0 ? (
            <TableRow style={{ borderColor: "var(--platform-border)" }}>
              <TableCell colSpan={6} className="h-24 text-center" style={{ color: "var(--platform-fg-muted)" }}>
                No se encontraron registros.
              </TableCell>
            </TableRow>
          ) : (
            filteredLogs.map((log) => (
              <TableRow
                key={log.id}
                className="hover:opacity-90"
                style={{ borderColor: "var(--platform-border)" }}
              >
                <TableCell style={{ borderColor: "var(--platform-border)" }}>
                  <StatusBadge status={log.status} />
                </TableCell>
                <TableCell className="font-medium" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}>
                  {log.etl_name}
                </TableCell>
                <TableCell style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
                  {log.destination_table_name}
                </TableCell>
                <TableCell style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
                  {new Date(log.started_at).toLocaleString("es-ES", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TableCell>
                <TableCell className="text-right font-mono" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}>
                  {log.rows_processed !== null
                    ? log.rows_processed.toLocaleString()
                    : "-"}
                </TableCell>
                <TableCell className="text-sm truncate max-w-[200px]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }} title={log.error_message || ""}>
                  {log.error_message || "-"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <Badge
        className="gap-1 pl-1.5 shadow-none border-0"
        style={{
          background: "var(--platform-success-dim)",
          color: "var(--platform-success)",
        }}
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        Completado
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge
        className="gap-1 pl-1.5 shadow-none border-0"
        style={{
          background: "rgba(248,113,113,0.15)",
          color: "var(--platform-danger)",
        }}
      >
        <AlertCircle className="w-3.5 h-3.5" />
        Fallido
      </Badge>
    );
  }
  return (
    <Badge
      className="gap-1 pl-1.5 shadow-none border-0"
      style={{
        background: "var(--platform-accent-dim)",
        color: "var(--platform-accent)",
      }}
    >
      <CircleDashed className="w-3.5 h-3.5 animate-spin" />
      En progreso
    </Badge>
  );
}
