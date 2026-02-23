"use client";
import { useCallback, useEffect, useState } from "react";
import EtlCard, { Etl } from "@/components/etl/EtlCard";
import { createClient } from "@/lib/supabase/client";
import { getEtlsAdmin, deleteEtlAdmin } from "@/app/admin/(main)/etl/actions";
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
import { Trash2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Optional shape to help with mapping Supabase rows to the Etl UI type
type SupabaseEtlRow = {
  id: string | number;
  title?: string;
  name?: string;
  image_url?: string | null;
  thumbnail_url?: string | null;
  status?: string | null;
  published?: boolean | null;
  description?: string | null;
  views?: number | null;
  user_id?: string;
  client_id?: string | null;
  created_at?: string | null;
  lastExecution?: string | null;
  createdAt?: string | null;
};

function formatEtlDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function formatEtlDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

type FilterType = "todos" | "publicados" | "borradores";

interface AdminEtlGridProps {
  searchQuery?: string;
  filter?: FilterType;
  clientId?: string;
}

export default function AdminEtlGrid({
  searchQuery = "",
  filter = "todos",
  clientId = "",
}: AdminEtlGridProps) {
  const [etls, setEtls] = useState<Etl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);

  const loadFromClient = useCallback(async (): Promise<Etl[]> => {
    const supabase = createClient();
    let query = supabase
      .from("etl")
      .select("*")
      .order("created_at", { ascending: false });
    if (clientId && clientId.trim() !== "") {
      query = query.eq("client_id", clientId.trim());
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data as SupabaseEtlRow[] | null) ?? [];
    const etlIds = rows.map((r) => String(r.id)).filter(Boolean);
    const ownerIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
    const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean))) as string[];

    let lastRunByEtlId: Record<string, string> = {};
    if (etlIds.length > 0) {
      const { data: runs } = await supabase
        .from("etl_runs_log")
        .select("etl_id, completed_at, started_at")
        .in("etl_id", etlIds)
        .order("started_at", { ascending: false });
      for (const run of runs ?? []) {
        const id = (run as { etl_id?: string | null }).etl_id;
        if (id && lastRunByEtlId[id] == null)
          lastRunByEtlId[id] =
            (run as { completed_at?: string | null }).completed_at ??
            (run as { started_at?: string }).started_at ??
            "";
      }
    }
    let ownerById: Record<string, string | null> = {};
    let clientById: Record<string, string | null> = {};
    if (ownerIds.length > 0) {
      const { data: owners } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ownerIds);
      ownerById = Object.fromEntries((owners ?? []).map((o: { id: string; full_name?: string | null }) => [o.id, o.full_name ?? null]));
    }
    if (clientIds.length > 0) {
      const { data: clientRows } = await supabase
        .from("clients")
        .select("id, company_name, individual_full_name")
        .in("id", clientIds);
      clientById = Object.fromEntries(
        (clientRows ?? []).map((c: { id: string; company_name?: string | null; individual_full_name?: string | null }) => [
          c.id,
          (c.company_name || c.individual_full_name) ?? null,
        ])
      );
    }
    return rows.map((row) => {
      const status: Etl["status"] =
        row.status === "Publicado" || row.status === "Borrador"
          ? row.status
          : row.published
          ? "Publicado"
          : "Borrador";
      return {
        id: String(row.id),
        title: row.title ?? row.name ?? "Sin título",
        imageUrl: row.image_url ?? row.thumbnail_url ?? "/Image.svg",
        status,
        description: row.description ?? "",
        views: typeof row.views === "number" ? row.views : 0,
        lastExecution: formatEtlDateTime(lastRunByEtlId[String(row.id)] ?? (row as SupabaseEtlRow).lastExecution),
        nextExecution: "", // No hay próxima ejecución en el modelo actual
        createdAt: formatEtlDate((row as SupabaseEtlRow).created_at ?? (row as SupabaseEtlRow).createdAt),
        clientId: row.client_id ?? "",
        ownerId: row.user_id,
        owner: row.user_id ? { fullName: ownerById[row.user_id] ?? null } : undefined,
        client: row.client_id ? { name: clientById[row.client_id] ?? null } : undefined,
      } satisfies Etl;
    });
  }, [clientId]);

  const loadEtls = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const timeoutMs = 8000;
      const adminPromise = getEtlsAdmin({ clientId: clientId?.trim() || undefined });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs)
      );
      const res = await Promise.race([adminPromise, timeoutPromise]);
      if (res.ok && res.data) {
        const rows = (res.data ?? []) as SupabaseEtlRow[];
        const owners: Record<string, string | null> = res.owners ?? {};
        const clients: Record<string, string | null> = res.clients ?? {};
        const mapped: Etl[] = rows.map((row) => {
          const status: Etl["status"] =
            row.status === "Publicado" || row.status === "Borrador"
              ? row.status
              : row.published
              ? "Publicado"
              : "Borrador";
          return {
            id: String(row.id),
            title: row.title ?? row.name ?? "Sin título",
            imageUrl: row.image_url ?? row.thumbnail_url ?? "/Image.svg",
            status,
            description: row.description ?? "",
            views: typeof row.views === "number" ? row.views : 0,
            lastExecution: formatEtlDateTime((row as SupabaseEtlRow).lastExecution),
            nextExecution: "", // No hay próxima ejecución en el modelo actual
            createdAt: formatEtlDate((row as SupabaseEtlRow).created_at ?? (row as SupabaseEtlRow).createdAt),
            clientId: row.client_id ?? "",
            ownerId: row.user_id,
            owner: row.user_id ? { fullName: owners[row.user_id] ?? null } : undefined,
            client: row.client_id ? { name: clients[row.client_id] ?? null } : undefined,
          } satisfies Etl;
        });
        setEtls(mapped);
        return;
      }
      const mapped = await loadFromClient();
      setEtls(mapped);
    } catch {
      try {
        const mapped = await loadFromClient();
        setEtls(mapped);
        setError(null);
      } catch (err: any) {
        setError(err?.message ?? "Error cargando ETLs");
        setEtls([]);
      }
    } finally {
      setLoading(false);
    }
  }, [loadFromClient, clientId]);

  useEffect(() => {
    loadEtls();
  }, [loadEtls]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse overflow-hidden rounded-[15px] border"
            style={{
              background: "var(--platform-surface)",
              borderColor: "var(--platform-border)",
            }}
          >
            <div className="h-[193px] w-full" style={{ background: "var(--platform-surface-hover)" }} />
            <div className="space-y-3 p-5">
              <div className="h-4 w-1/2 rounded" style={{ background: "var(--platform-surface-hover)" }} />
              <div className="h-3 w-1/3 rounded" style={{ background: "var(--platform-surface-hover)" }} />
              <div className="h-3 w-full rounded" style={{ background: "var(--platform-surface-hover)" }} />
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
        {error}
      </div>
    );
  }

  // Apply client-side filtering based on props
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = etls.filter((d) => {
    const matchesQuery = normalizedQuery
      ? d.title.toLowerCase().includes(normalizedQuery) ||
        d.description.toLowerCase().includes(normalizedQuery)
      : true;
    const matchesFilter =
      filter === "todos"
        ? true
        : filter === "publicados"
        ? d.status === "Publicado"
        : d.status === "Borrador";
    const matchesClient = !clientId?.trim() || (d.clientId ?? "") === clientId.trim();
    return matchesQuery && matchesFilter && matchesClient;
  });

  const selectedSet = new Set(selectedIds);
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const selectAllFiltered = () => {
    const ids = filtered.map((e) => e.id);
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
    let ok = 0;
    let fail = 0;
    for (const id of selectedIds) {
      const res = await deleteEtlAdmin(id);
      if (res.ok) ok++; else fail++;
    }
    setBulkDeleting(false);
    setSelectedIds([]);
    setBulkDeleteModalOpen(false);
    loadEtls();
    if (fail > 0) toast.error(`${fail} no se pudieron eliminar.`);
    if (ok > 0) toast.success(ok === 1 ? "ETL eliminado." : `${ok} ETLs eliminados.`);
  };

  if (etls.length === 0) {
    return (
      <div
        className="rounded-xl border p-6 text-center text-sm"
        style={{
          borderColor: "var(--platform-border)",
          background: "var(--platform-surface)",
          color: "var(--platform-fg-muted)",
        }}
      >
        No hay etls en la plataforma.
      </div>
    );
  }

  return (
    <>
      {selectedIds.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 mb-4"
          style={{
            borderColor: "var(--platform-border)",
            background: "var(--platform-accent-dim)",
          }}
        >
          <span className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>
            {selectedIds.length} seleccionado{selectedIds.length !== 1 ? "s" : ""}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg h-9"
            style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
            onClick={selectAllFiltered}
          >
            Seleccionar todos los visibles
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
            Quitar selección
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-lg h-9 gap-1.5"
            style={{ background: "var(--platform-danger)", color: "#fff" }}
            onClick={openBulkDeleteModal}
            disabled={bulkDeleting}
          >
            <Trash2 className="h-4 w-4" />
            {bulkDeleting ? "Eliminando…" : "Eliminar seleccionados"}
          </Button>
        </div>
      )}

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
              {selectedIds.length === 1 ? "Eliminar ETL" : "Eliminar ETLs seleccionados"}
            </DialogTitle>
            <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
              {selectedIds.length === 1
                ? "¿Eliminar este ETL? Esta acción no se puede deshacer."
                : `¿Eliminar los ${selectedIds.length} ETLs seleccionados? Esta acción no se puede deshacer.`}
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(filtered.length > 0 ? filtered : []).map((etl) => (
          <div key={etl.id} className="relative">
            <div
              className="absolute left-2.5 top-2.5 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={selectedSet.has(etl.id)}
                onCheckedChange={() => toggleSelect(etl.id)}
                className="h-4 w-4 rounded-md border-2 border-[var(--platform-fg-muted)] data-[state=checked]:border-[var(--platform-accent)] data-[state=checked]:bg-[var(--platform-accent)] data-[state=checked]:text-white"
              />
            </div>
            <EtlCard
              etl={etl}
              basePath="/admin/etl"
              onDeleted={loadEtls}
              onSaved={loadEtls}
              useAdminDelete
            />
          </div>
        ))}
        {filtered.length === 0 && (
          <div
            className="col-span-full rounded-xl border p-6 text-center text-sm"
            style={{
              borderColor: "var(--platform-border)",
              background: "var(--platform-surface)",
              color: "var(--platform-fg-muted)",
            }}
          >
            No hay resultados para los filtros aplicados.
          </div>
        )}
      </div>
    </>
  );
}
