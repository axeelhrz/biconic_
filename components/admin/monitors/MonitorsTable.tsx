"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, CircleDashed, Trash2, X, XCircle, Loader2 } from "lucide-react";
import { deleteMonitorRunsAdmin } from "@/app/admin/(main)/monitors/actions";
import { toast } from "sonner";

type LogEntry = {
  id: string;
  etl_id: string | null;
  status: "started" | "running" | "completed" | "failed";
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [markingFailedId, setMarkingFailedId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadLogs = useCallback(async (showLoading = true) => {
    const supabase = createClient();
    try {
      if (showLoading) setLoading(true);

      const { data: logsData, error: logsError } = await supabase
        .from("etl_runs_log")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(100);

      if (logsError) throw logsError;

      if (!logsData || logsData.length === 0) {
        if (mountedRef.current) setLogs([]);
        return;
      }

      const etlIds = Array.from(
        new Set(logsData.map((l) => l.etl_id).filter(Boolean).map((id) => String(id)))
      ) as string[];

      const etlNameMap = new Map<string, string>();

      if (etlIds.length > 0) {
        const { data: etlsData, error: etlsError } = await supabase
          .from("etl")
          .select("id, title, name")
          .in("id", etlIds);

        if (!etlsError && etlsData) {
          etlsData.forEach((etl: { id: string; title?: string | null; name?: string | null }) => {
            etlNameMap.set(String(etl.id), (etl.title || etl.name || "Sin nombre").trim() || "Sin nombre");
          });
        }
      }

      const mappedLogs: LogEntry[] = logsData.map((log) => ({
        ...log,
        etl_name: log.etl_id ? (etlNameMap.get(String(log.etl_id)) || "—") : "—",
      }));

      if (mountedRef.current) {
        setLogs(mappedLogs);
        setError(null);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err?.message || "Error cargando logs");
      }
    } finally {
      if (mountedRef.current && showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs(true);
  }, [loadLogs]);

  // Cuando hay ejecuciones en progreso, refrescar cada 5s para actualizar estado
  const hasInProgress = logs.some(
    (l) => l.status === "started" || l.status === "running"
  );
  useEffect(() => {
    if (!hasInProgress) return;
    const interval = setInterval(() => loadLogs(false), 5000);
    return () => clearInterval(interval);
  }, [hasInProgress, loadLogs]);

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

  const selectedSet = new Set(selectedIds);
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const selectAllFiltered = () => {
    const ids = filteredLogs.map((l) => l.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };
  const clearSelection = () => setSelectedIds([]);
  const openBulkDeleteModal = () => {
    if (selectedIds.length > 0) setBulkDeleteModalOpen(true);
  };
  const handleBulkDeleteConfirm = async () => {
    if (selectedIds.length === 0) return;
    setBulkDeleting(true);
    const res = await deleteMonitorRunsAdmin(selectedIds);
    setBulkDeleting(false);
    setSelectedIds([]);
    setBulkDeleteModalOpen(false);
    if (res.ok) {
      loadLogs(true);
      toast.success(selectedIds.length === 1 ? "Registro eliminado." : `${selectedIds.length} registros eliminados.`);
    } else {
      toast.error(res.error || "Error al eliminar");
    }
  };
  const handleDeleteOne = async (id: string) => {
    setDeletingId(id);
    const res = await deleteMonitorRunsAdmin([id]);
    setDeletingId(null);
    if (res.ok) {
      loadLogs(true);
      toast.success("Registro eliminado.");
    } else {
      toast.error(res.error || "Error al eliminar");
    }
  };

  const handleMarkRunFailed = async (log: LogEntry) => {
    if (!log.etl_id || (log.status !== "started" && log.status !== "running")) return;
    setMarkingFailedId(log.id);
    try {
      const res = await fetch(`/api/etl/${log.etl_id}/mark-run-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: log.id,
          error_message: "Marcado como fallido (timeout o interrupción).",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        loadLogs(false);
        toast.success("Run marcado como fallido.");
      } else {
        toast.error(data?.error || "Error al marcar como fallido");
      }
    } catch (e: any) {
      toast.error(e?.message || "Error al marcar como fallido");
    } finally {
      setMarkingFailedId(null);
    }
  };

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
    <>
      {/* Barra superior: seleccionar todo, quitar todo, cantidad, eliminar */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 mb-4"
        style={{
          borderColor: "var(--platform-border)",
          background: "var(--platform-surface)",
        }}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg h-9"
          style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
          onClick={selectAllFiltered}
        >
          Seleccionar todo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg h-9 gap-1.5"
          style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
          onClick={clearSelection}
        >
          <X className="h-4 w-4" />
          Quitar todo
        </Button>
        {selectedIds.length > 0 && (
          <>
            <span className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>
              {selectedIds.length} seleccionado{selectedIds.length !== 1 ? "s" : ""}
            </span>
            <Button
              type="button"
              size="sm"
              className="rounded-lg h-9 gap-1.5 ml-auto"
              style={{ background: "var(--platform-danger)", color: "#fff" }}
              onClick={openBulkDeleteModal}
              disabled={bulkDeleting}
            >
              <Trash2 className="h-4 w-4" />
              {bulkDeleting ? "Eliminando…" : "Eliminar seleccionados"}
            </Button>
          </>
        )}
      </div>

      <Dialog open={bulkDeleteModalOpen} onOpenChange={setBulkDeleteModalOpen}>
        <DialogContent
          className="sm:max-w-[400px]"
          style={{
            background: "var(--platform-surface)",
            borderColor: "var(--platform-border)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--platform-fg)" }}>
              {selectedIds.length === 1 ? "Eliminar registro" : "Eliminar registros seleccionados"}
            </DialogTitle>
            <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
              {selectedIds.length === 1
                ? "¿Eliminar este registro del historial? Esta acción no se puede deshacer."
                : `¿Eliminar los ${selectedIds.length} registros seleccionados? Esta acción no se puede deshacer.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkDeleteModalOpen(false)}
              disabled={bulkDeleting}
              className="rounded-xl"
              style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="rounded-xl gap-2"
              style={{ background: "var(--platform-danger)", color: "#fff" }}
              onClick={handleBulkDeleteConfirm}
              disabled={bulkDeleting}
            >
              {bulkDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {bulkDeleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <TableHead className="w-12" style={{ color: "var(--platform-fg-muted)" }} />
              <TableHead className="w-[140px]" style={{ color: "var(--platform-fg-muted)" }}>Estado</TableHead>
              <TableHead style={{ color: "var(--platform-fg-muted)" }}>ETL</TableHead>
              <TableHead style={{ color: "var(--platform-fg-muted)" }}>Tabla Destino</TableHead>
              <TableHead style={{ color: "var(--platform-fg-muted)" }}>Inicio</TableHead>
              <TableHead className="text-right" style={{ color: "var(--platform-fg-muted)" }}>Registros</TableHead>
              <TableHead className="w-[30%]" style={{ color: "var(--platform-fg-muted)" }}>Mensaje</TableHead>
              <TableHead className="w-12" style={{ color: "var(--platform-fg-muted)" }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.length === 0 ? (
              <TableRow style={{ borderColor: "var(--platform-border)" }}>
                <TableCell colSpan={8} className="h-24 text-center" style={{ color: "var(--platform-fg-muted)" }}>
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
                    <Checkbox
                      checked={selectedSet.has(log.id)}
                      onCheckedChange={() => toggleSelect(log.id)}
                      className="h-4 w-4 rounded-md border-2 border-[var(--platform-fg-muted)] data-[state=checked]:border-[var(--platform-accent)] data-[state=checked]:bg-[var(--platform-accent)] data-[state=checked]:text-white"
                    />
                  </TableCell>
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
                  <TableCell style={{ borderColor: "var(--platform-border)" }}>
                    <div className="flex items-center gap-1">
                    {(log.status === "started" || log.status === "running") && log.etl_id && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-[var(--platform-fg-muted)] hover:text-amber-600"
                        onClick={() => handleMarkRunFailed(log)}
                        disabled={markingFailedId === log.id}
                        title="Marcar como fallido (timeout o interrupción)"
                      >
                        {markingFailedId === log.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-[var(--platform-fg-muted)] hover:text-[var(--platform-danger)]"
                      onClick={() => handleDeleteOne(log.id)}
                      disabled={deletingId === log.id}
                      title="Eliminar registro"
                    >
                      {deletingId === log.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
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
