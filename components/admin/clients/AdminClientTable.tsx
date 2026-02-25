"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FolderOpen, Users, Eye, CreditCard, X, Download, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Database } from "@/lib/supabase/database.types";
import EditSubscriptionDialog from "./EditSubscriptionDialog";
import { deleteClients } from "@/app/admin/(main)/clients/actions";

type FilterType = "todos" | "activos" | "inactivos";
type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];
type BillingInterval = Database["public"]["Enums"]["billing_interval"];

export interface ClientRow {
  id: string;
  name: string;
  plan: string | null;
  status: string | null;
  dashboards: number;
  members: number;
  location?: string;
  industry?: string | null;
  subscription?: {
    id: string;
    plan_id: string;
    status: SubscriptionStatus;
    billing_interval: BillingInterval;
  } | null;
}

interface AdminClientTableProps {
  search?: string;
  filter?: FilterType;
}

export default function AdminClientTable({ search = "", filter = "todos" }: AdminClientTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<ClientRow["subscription"] | null>(null);
  const [isEditSubscriptionOpen, setIsEditSubscriptionOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const refreshData = useCallback(async () => {
    await loadData();
  }, []);

  const loadData = useCallback(async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data: ures, error: uerr } = await supabase.auth.getUser();
        if (uerr) throw uerr;
        if (!ures.user) {
          setRows([]);
          setTotal(0);
          setLoading(false);
          return;
        }

        let query = supabase
          .from("clients")
          .select(
            `id, company_name, status, capital, countries(name), 
             subscriptions(id, plan_id, status, billing_interval, plans(name)), 
             dashboard(count), client_members(count)`,
            { count: "exact" }
          )
          .order("created_at", { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1);

        if (typeof search === "string" && search.trim()) {
          query = query.ilike("company_name", `%${search.trim()}%`);
        }
        if (filter === "activos" || filter === "inactivos") {
          const target = filter === "activos" ? "Activo" : "Desactivado";
          query = query.eq("status", target);
        }

        const { data, count, error } = await query;
        if (error) throw error;

        const mapped = (data ?? []).map((r: any) => {
          const dashboards = r?.dashboard?.[0]?.count ?? 0;
          const members = r?.client_members?.[0]?.count ?? 0;
          
          let plan = null;
          let subscription = null;
          
          if (r?.subscriptions && r.subscriptions.length > 0) {
              const sub = r.subscriptions[0];
              plan = sub.plans?.name ?? null;
              subscription = {
                  id: sub.id,
                  plan_id: sub.plan_id,
                  status: sub.status,
                  billing_interval: sub.billing_interval
              };
          }

          const status = r?.status ?? null;
          const countryName = r?.countries?.name ?? "";
          const city = r?.capital ?? "";
          
          let location = "—";
          if (city && countryName) location = `${city}, ${countryName}`;
          else if (countryName) location = countryName;
          else if (city) location = city;

          return {
            id: r.id as string,
            name: r.company_name ?? "—",
            plan,
            status,
            dashboards,
            members,
            location,
            industry: "Tecnología",
            subscription,
          } as ClientRow;
        });

        setRows(mapped);
        setTotal(count ?? mapped.length);
      } catch (e) {
        console.error(e);
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
  }, [page, pageSize, search, filter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedSet = new Set(selectedIds);
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const selectAllPage = () => {
    const ids = rows.map((r) => r.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };
  const clearSelection = () => setSelectedIds([]);
  const exportCurrent = () => exportCSV(rows);
  const exportSelected = () => {
    const toExport = rows.filter((r) => selectedSet.has(r.id));
    if (toExport.length === 0) {
      toast.info("Seleccioná al menos un cliente para exportar");
      return;
    }
    exportCSV(toExport);
  };
  const handleBulkDeleteConfirm = async () => {
    if (selectedIds.length === 0) return;
    setDeleting(true);
    const res = await deleteClients(selectedIds);
    setDeleting(false);
    setBulkDeleteOpen(false);
    setSelectedIds([]);
    if (res.ok) {
      toast.success(selectedIds.length === 1 ? "Cliente eliminado." : `${selectedIds.length} clientes eliminados.`);
      loadData();
    } else {
      toast.error(res.error ?? "No se pudo eliminar");
    }
  };

  const handleEditSubscription = (subscription: ClientRow["subscription"] | null, clientId: string) => {
      setSelectedSubscription(subscription);
      setSelectedClientId(clientId);
      setIsEditSubscriptionOpen(true);
  };


  return (
    <div className="flex w-full flex-col gap-5">
      {/* Barra: seleccionar todo, quitar todo, cantidad, exportar, eliminar */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
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
          onClick={selectAllPage}
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
          <span className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>
            {selectedIds.length} seleccionado{selectedIds.length !== 1 ? "s" : ""}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg h-9 gap-1.5"
          style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
          onClick={selectedIds.length > 0 ? exportSelected : exportCurrent}
        >
          <Download className="h-4 w-4" />
          {selectedIds.length > 0 ? "Exportar selección" : "Exportar página"}
        </Button>
        {selectedIds.length > 0 && (
          <Button
            type="button"
            size="sm"
            className="rounded-lg h-9 gap-1.5 ml-auto"
            style={{ background: "var(--platform-danger)", color: "#fff" }}
            onClick={() => setBulkDeleteOpen(true)}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? "Eliminando…" : "Eliminar seleccionados"}
          </Button>
        )}
      </div>

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent
          className="sm:max-w-[400px]"
          style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--platform-fg)" }}>
              {selectedIds.length === 1 ? "Eliminar cliente" : "Eliminar clientes seleccionados"}
            </DialogTitle>
            <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
              {selectedIds.length === 1
                ? "¿Eliminar este cliente? Se eliminarán sus datos asociados. Esta acción no se puede deshacer."
                : `¿Eliminar los ${selectedIds.length} clientes seleccionados? Esta acción no se puede deshacer.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              disabled={deleting}
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
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {deleting ? "Eliminando…" : "Eliminar"}
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
        <div
          className="flex items-center justify-between gap-4 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wider"
          style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)", color: "var(--platform-fg-muted)" }}
        >
          <div className="w-8" />
          <div className="w-[220px]">Cliente</div>
          <div className="w-[100px]">Plan</div>
          <div className="w-[100px]">Estado</div>
          <div className="w-[90px]">Proyectos</div>
          <div className="w-[90px]">Usuarios</div>
          <div className="w-[100px]">Industria</div>
          <div className="w-[100px] text-center">Acciones</div>
        </div>

        <div className="divide-y" style={{ borderColor: "var(--platform-border)" }}>
          {loading && <SkeletonRows />}
          {!loading && rows.length === 0 && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--platform-fg-muted)" }}>
              No hay clientes para mostrar.
            </div>
          )}
          {!loading &&
            rows.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm align-middle"
                style={{ color: "var(--platform-fg)" }}
              >
                <div className="w-8 flex items-center">
                  <Checkbox
                    checked={selectedSet.has(r.id)}
                    onCheckedChange={() => toggleSelect(r.id)}
                    className="h-4 w-4 rounded-md border-2 border-[var(--platform-fg-muted)] data-[state=checked]:border-[var(--platform-accent)] data-[state=checked]:bg-[var(--platform-accent)] data-[state=checked]:text-white"
                  />
                </div>

              <div className="flex w-[220px] items-center gap-2 min-w-0">
                <div
                  className="flex h-[35px] w-[35px] items-center justify-center rounded-full text-[12px] font-bold"
                  style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
                >
                  {initials(r.name)}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px]" style={{ color: "var(--platform-fg)" }}>
                    {r.name}
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--platform-fg-muted)" }}>
                    {r.location}
                  </span>
                </div>
              </div>

              <div className="w-[100px]">
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}
                >
                  {r.plan ?? "—"}
                </span>
              </div>

              <div className="w-[100px]">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-[14px] font-medium",
                    r.status?.toLowerCase() === "activo" && "bg-[var(--platform-success-dim)]",
                    r.status?.toLowerCase() === "desactivado" && "bg-[var(--platform-danger)]/20"
                  )}
                  style={{
                    color:
                      r.status?.toLowerCase() === "activo"
                        ? "var(--platform-success)"
                        : r.status?.toLowerCase() === "desactivado"
                        ? "var(--platform-danger)"
                        : "var(--platform-fg-muted)",
                    ...(r.status?.toLowerCase() !== "activo" && r.status?.toLowerCase() !== "desactivado"
                      ? { background: "var(--platform-surface-hover)" }
                      : {}),
                  }}
                >
                  {r.status ?? "—"}
                </span>
              </div>

              <div className="flex w-[90px] items-center gap-1" style={{ color: "var(--platform-accent)" }}>
                <FolderOpen className="h-4 w-4 shrink-0" />
                <span className="text-sm">{r.dashboards}</span>
              </div>

              <div className="flex w-[90px] items-center gap-1" style={{ color: "var(--platform-accent)" }}>
                <Users className="h-4 w-4 shrink-0" />
                <span className="text-sm">{r.members}</span>
              </div>

              <div className="w-[100px]">
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium"
                  style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg-muted)" }}
                >
                  {r.industry ?? "—"}
                </span>
              </div>

              <div className="flex w-[100px] items-center justify-center gap-1">
                <Link
                  href={`/admin/clients/${r.id}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:opacity-80"
                  style={{ color: "var(--platform-fg)" }}
                  aria-label="Ver"
                >
                  <Eye className="h-5 w-5" />
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:opacity-80"
                  style={{ color: "var(--platform-fg)" }}
                  onClick={() => handleEditSubscription(r.subscription ?? null, r.id)}
                  title={r.subscription ? "Editar Suscripción" : "Asignar Suscripción"}
                >
                  <CreditCard className="h-5 w-5" />
                </Button>
              </div>
            </div>
          ))}
      </div>

      </div>

      <div className="flex items-center justify-center gap-4 py-4">
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-xl"
          style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          Anterior
        </Button>
        <div className="flex items-center gap-2">
          {useMemo(() => {
            const nums: number[] = [];
            const start = Math.max(1, page - 2);
            const end = Math.min(totalPages, start + 4);
            for (let i = start; i <= end; i++) nums.push(i);
            return nums;
          }, [page, totalPages]).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold transition-colors",
                n === page && "bg-[var(--platform-accent)] text-[var(--platform-accent-fg)]"
              )}
              style={
                n !== page
                  ? { border: "1px solid var(--platform-border)", background: "transparent", color: "var(--platform-fg-muted)" }
                  : undefined
              }
            >
              {n}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-xl"
          style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Siguiente
        </Button>
      </div>

      {isEditSubscriptionOpen && (
        <EditSubscriptionDialog
          open={isEditSubscriptionOpen}
          onOpenChange={setIsEditSubscriptionOpen}
          subscription={selectedSubscription ?? null}
          clientId={selectedClientId}
          onSaved={refreshData}
        />
      )}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="h-[34px] rounded-full px-3 text-[13px] font-medium"
      style={{
        background: active ? "var(--platform-accent)" : "transparent",
        color: active ? "#08080b" : "var(--platform-accent)",
        border: `1px solid var(--platform-accent)`,
      }}
    >
      {label}
    </button>
  );
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 px-[15px] py-2.5"
        >
          {Array.from({ length: 8 }).map((__, j) => (
            <div
              key={j}
              className="h-4 w-full max-w-[200px] animate-pulse rounded"
              style={{ background: "var(--platform-surface-hover)" }}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function exportCSV(rows: ClientRow[]) {
  const header = [
    "id",
    "name",
    "plan",
    "status",
    "dashboards",
    "members",
    "industry",
  ];
  const lines = [header.join(",")].concat(
    rows.map((r) =>
      [
        r.id,
        escapeCsv(r.name),
        r.plan ?? "",
        r.status ?? "",
        r.dashboards,
        r.members,
        r.industry ?? "",
      ].join(",")
    )
  );
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "clientes.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(s: string) {
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return '"' + s.replaceAll('"', '""') + '"';
  }
  return s;
}
