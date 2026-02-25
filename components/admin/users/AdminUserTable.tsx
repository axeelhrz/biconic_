"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  getAdminUsers,
  type AdminUser,
  type CompanyAccess,
  setUserAppRole,
  setUserStatus,
  deleteProfile,
  deleteProfiles,
} from "@/app/admin/(main)/users/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/Select";
import { Eye, PencilLine, Trash2, X, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Database } from "@/lib/supabase/database.types";

type FilterType = "todos" | "activos" | "inactivos";
type AppRole = Database["public"]["Enums"]["app_role"];

interface Props {
  search: string;
  filter: FilterType;
}

export default function AdminUserTable({ search, filter }: Props) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [singleDeleteOpen, setSingleDeleteOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadPage = useCallback(async () => {
    setLoading(true);
    const res = await getAdminUsers({ page, pageSize, search, filter });
    setLoading(false);
    if (res.ok && res.data) {
      setRows(res.data.users);
      setTotal(res.data.total);
    } else if (!res.ok) {
      toast.error(res.error ?? "No se pudieron cargar los usuarios");
    }
  }, [page, pageSize, search, filter]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const selectedSet = new Set(selectedIds);
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const selectAllPage = () => {
    const ids = rows.map((u) => u.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };
  const clearSelection = () => setSelectedIds([]);
  const exportCurrent = () => exportCSV(rows);
  const exportSelected = () => {
    const toExport = rows.filter((u) => selectedSet.has(u.id));
    if (toExport.length === 0) {
      toast.info("Seleccioná al menos un usuario para exportar");
      return;
    }
    exportCSV(toExport);
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedIds.length === 0) return;
    setDeleting(true);
    const res = await deleteProfiles(selectedIds);
    setDeleting(false);
    setBulkDeleteOpen(false);
    setSelectedIds([]);
    if (res.ok) {
      toast.success(selectedIds.length === 1 ? "Usuario eliminado." : `${selectedIds.length} usuarios eliminados.`);
      loadPage();
    } else {
      toast.error(res.error ?? "No se pudo eliminar");
    }
  };

  const openSingleDelete = (u: AdminUser) => {
    setUserToDelete(u);
    setSingleDeleteOpen(true);
  };
  const handleSingleDeleteConfirm = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    const res = await deleteProfile(userToDelete.id);
    setDeleting(false);
    setSingleDeleteOpen(false);
    setUserToDelete(null);
    if (res.ok) {
      toast.success("Usuario eliminado.");
      setRows((r) => r.filter((x) => x.id !== userToDelete.id));
      setTotal((t) => Math.max(0, t - 1));
    } else {
      toast.error(res.error ?? "No se pudo eliminar");
    }
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

      {/* Modal eliminar varios */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent
          className="sm:max-w-[400px]"
          style={{
            background: "var(--platform-surface)",
            borderColor: "var(--platform-border)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--platform-fg)" }}>
              {selectedIds.length === 1 ? "Eliminar usuario" : "Eliminar usuarios seleccionados"}
            </DialogTitle>
            <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
              {selectedIds.length === 1
                ? "¿Eliminar este usuario? Esta acción no se puede deshacer."
                : `¿Eliminar los ${selectedIds.length} usuarios seleccionados? Esta acción no se puede deshacer.`}
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

      {/* Modal eliminar uno */}
      <Dialog open={singleDeleteOpen} onOpenChange={setSingleDeleteOpen}>
        <DialogContent
          className="sm:max-w-[400px]"
          style={{
            background: "var(--platform-surface)",
            borderColor: "var(--platform-border)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--platform-fg)" }}>Eliminar usuario</DialogTitle>
            <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
              ¿Eliminar a {userToDelete?.name} ({userToDelete?.email})? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSingleDeleteOpen(false)}
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
              onClick={handleSingleDeleteConfirm}
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
      <div className="w-full overflow-x-auto">
        <table className="min-w-[800px] w-full table-fixed">
          <thead style={{ background: "var(--platform-bg-elevated)" }}>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--platform-fg-muted)" }}>
              <Th className="w-12 px-3 py-3" />
              <Th className="w-[200px] px-3 py-3">Usuario</Th>
              <Th className="w-[200px] px-3 py-3">Correo</Th>
              <Th className="w-[130px] px-3 py-3">Activo desde</Th>
              <Th className="w-[200px] px-3 py-3">Empresas</Th>
              <Th className="w-[110px] px-3 py-3">Estado</Th>
              <Th className="w-[120px] px-3 py-3">Rol</Th>
              <Th className="w-[100px] px-3 py-3">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <SkeletonRows />}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-sm"
                  style={{ color: "var(--platform-fg-muted)" }}
                >
                  No hay usuarios para mostrar.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((u) => (
                <tr
                  key={u.id}
                  className="border-b text-sm"
                  style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
                >
                  <Td className="px-3 py-3" style={{ borderColor: "var(--platform-border)" }}>
                    <Checkbox
                      checked={selectedSet.has(u.id)}
                      onCheckedChange={() => toggleSelect(u.id)}
                      className="h-4 w-4 rounded-md border-2 border-[var(--platform-fg-muted)] data-[state=checked]:border-[var(--platform-accent)] data-[state=checked]:bg-[var(--platform-accent)] data-[state=checked]:text-white"
                    />
                  </Td>
                  <Td className="px-3 py-3 align-middle" style={{ borderColor: "var(--platform-border)" }}>
                    <div className="flex items-center gap-3">
                      <div
                        className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full"
                        style={{ background: "var(--platform-surface-hover)" }}
                      >
                        {/* next/image requires whitelisted domains; gravatar is allowed in next.config.ts per repo notes */}
                        {u.avatarUrl ? (
                          <Image
                            src={u.avatarUrl}
                            alt={u.name}
                            fill
                            sizes="35px"
                          />
                        ) : null}
                      </div>
                      <span className="truncate">{u.name}</span>
                    </div>
                  </Td>
                  <Td style={{ borderColor: "var(--platform-border)" }}>
                    <span className="truncate" style={{ color: "var(--platform-fg-muted)" }}>{u.email}</span>
                  </Td>
                  <Td style={{ borderColor: "var(--platform-border)" }}>
                    <span style={{ color: "var(--platform-fg-muted)" }}>
                      {formatDate(u.activeSince)}
                    </span>
                  </Td>
                  <Td style={{ borderColor: "var(--platform-border)" }}>
                    <div className="flex flex-wrap gap-1">
                      {u.companies && u.companies.length > 0 ? (
                        u.companies.map((c, i) => (
                          <CompanyBadge key={c.id} company={c} />
                        ))
                      ) : (
                        <span className="italic text-xs" style={{ color: "var(--platform-fg-muted)" }}>Sin empresa</span>
                      )}
                    </div>
                  </Td>
                  <Td style={{ borderColor: "var(--platform-border)" }}>
                    <Select
                      value={u.status}
onChange={async (next: string) => {
                          const prev = u.status;
                          setRows((r) =>
                            r.map((x) =>
                              x.id === u.id ? { ...x, status: next as "activo" | "inactivo" } : x
                            )
                          );
                          const res = await setUserStatus(u.id, next as "activo" | "inactivo");
                        if (!res.ok) {
                          setRows((r) =>
                            r.map((x) =>
                              x.id === u.id ? { ...x, status: prev } : x
                            )
                          );
                          toast.error(res.error ?? "No se pudo actualizar el estado");
                        } else {
                          toast.success("Estado actualizado");
                        }
                      }}
                      options={[
                        { label: "Activo", value: "activo" },
                        { label: "Inactivo", value: "inactivo" },
                      ]}
                      className="min-w-[100px]"
                      buttonClassName="h-9 rounded-xl text-sm font-medium border w-full justify-between px-3"
                      disablePortal
                    />
                  </Td>
                  <Td style={{ borderColor: "var(--platform-border)" }}>
                    <Select
                      value={u.app_role || ""}
                      onChange={async (nextRole: string) => {
                        const prevRole = u.app_role;
                        setRows((r) =>
                          r.map((x) =>
                            x.id === u.id ? { ...x, app_role: nextRole as AppRole } : x
                          )
                        );
                        const res = await setUserAppRole(u.id, nextRole as AppRole);
                        if (!res.ok) {
                          setRows((r) =>
                            r.map((x) =>
                              x.id === u.id ? { ...x, app_role: prevRole } : x
                            )
                          );
                          toast.error(res.error ?? "No se pudo actualizar el rol");
                        } else {
                          toast.success("Rol actualizado");
                        }
                      }}
                      options={[
                        { label: "Viewer", value: "VIEWER" },
                        { label: "Creator", value: "CREATOR" },
                        { label: "App Admin", value: "APP_ADMIN" },
                      ]}
                      className="min-w-[120px]"
                      buttonClassName="h-9 rounded-xl text-sm font-medium border w-full justify-between px-3"
                      disablePortal
                    />
                  </Td>
                  <Td style={{ borderColor: "var(--platform-border)" }}>
                    <div className="flex items-center gap-2">
                      <Dialog
                        open={!!selected && selected.id === u.id}
                        onOpenChange={(open) => setSelected(open ? u : null)}
                      >
                        <DialogTrigger asChild>
                          <IconButton label="Ver">
                            <Eye className="h-5 w-5" />
                          </IconButton>
                        </DialogTrigger>
                        <DialogContent
                          className="sm:max-w-[440px] rounded-2xl border"
                          style={{
                            background: "var(--platform-surface)",
                            borderColor: "var(--platform-border)",
                            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
                          }}
                        >
                          <DialogHeader>
                            <DialogTitle style={{ color: "var(--platform-fg)" }}>Detalles de usuario</DialogTitle>
                            <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
                              {u.name} — {u.email}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="mt-3 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)", background: "var(--platform-bg-elevated)" }}>
                            <p><strong style={{ color: "var(--platform-fg)" }}>Rol:</strong> {u.app_role || "Sin rol"}</p>
                            <p className="mt-1"><strong style={{ color: "var(--platform-fg)" }}>Estado:</strong> {u.status === "activo" ? "Activo" : "Inactivo"}</p>
                            <div className="mt-2">
                              <strong style={{ color: "var(--platform-fg)" }}>Empresas:</strong>
                              <ul className="ml-4 mt-1 list-disc">
                                {u.companies?.length ? u.companies.map(c => (
                                  <li key={c.id}>{c.name} ({c.role})</li>
                                )) : <li>Ninguna</li>}
                              </ul>
                            </div>
                            <p className="mt-2"><strong style={{ color: "var(--platform-fg)" }}>Activo desde:</strong> {formatDate(u.activeSince)}</p>
                          </div>
                          <DialogFooter>
                            <Button
                              onClick={() => setSelected(null)}
                              className="rounded-xl"
                              style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
                            >
                              Cerrar
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <IconButton label="Editar" onClick={() => router.push(`/admin/users/${u.id}/edit`)}>
                        <PencilLine className="h-5 w-5" />
                      </IconButton>
                      <IconButton label="Eliminar" onClick={() => openSingleDelete(u)}>
                        <Trash2 className="h-5 w-5" />
                      </IconButton>
                    </div>
                  </Td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      </div>

      {/* Paginación */}
      <Pagination
        page={page}
        totalPages={totalPages}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        onGo={(n) => setPage(n)}
      />
    </div>
  );
}

function Th({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <th className={cn("whitespace-nowrap px-4 py-2", className)} style={style}>{children}</th>
  );
}

function Td({
  className,
  style,
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-3 py-3 align-middle text-sm", className)} style={style} {...props}>
      {children}
    </td>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:opacity-80"
      style={{ color: "var(--platform-fg)" }}
    >
      {children}
    </button>
  );
}

function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
  onGo,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  onGo: (n: number) => void;
}) {
  const numbers = useMemo(() => {
    const arr: number[] = [];
    const max = totalPages;
    const start = Math.max(1, page - 2);
    const end = Math.min(max, start + 4);
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [page, totalPages]);

  return (
    <div className="flex items-center justify-center gap-4 py-2">
      <Button
        variant="outline"
        size="sm"
        className="h-9 rounded-xl"
        style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
        onClick={onPrev}
        disabled={page <= 1}
      >
        Anterior
      </Button>
      <div className="flex items-center gap-2">
        {numbers.map((n) => (
          <button
            key={n}
            onClick={() => onGo(n)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold transition-colors",
              n === page
                ? "bg-[var(--platform-accent)] text-[var(--platform-accent-fg)]"
                : "border bg-transparent"
            )}
            style={
              n !== page
                ? { borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }
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
        onClick={onNext}
        disabled={page >= totalPages}
      >
        Siguiente
      </Button>
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const formatter = new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
  return formatter.format(d);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function exportCSV(rows: AdminUser[]) {
  const header = [
    "id",
    "name",
    "email",
    "activeSince",
    "companies",
    "status",
    "app_role",
  ];
  const lines = [header.join(",")].concat(
    rows.map((r) =>
      [
        r.id,
        escapeCsv(r.name),
        r.email,
        r.activeSince,
        escapeCsv(r.companies?.map(c => `${c.name}(${c.role})`).join("|") || ""),
        r.status,
        r.app_role || "",
      ].join(",")
    )
  );
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "usuarios.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(s: string) {
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return '"' + s.replaceAll('"', '""') + '"';
  }
  return s;
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b" style={{ borderColor: "var(--platform-border)" }}>
          {Array.from({ length: 8 }).map((__, j) => (
            <td key={j} className="px-4 py-3" style={{ borderColor: "var(--platform-border)" }}>
              <div
                className="h-4 w-full max-w-[200px] animate-pulse rounded"
                style={{ background: "var(--platform-surface-hover)" }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

import { revokeDashboardAccess } from "@/app/admin/(main)/users/actions";

function CompanyBadge({ company }: { company: CompanyAccess }) {
  const isAdmin = company.role === "admin";
  const [dashboardToRevoke, setDashboardToRevoke] = useState<{id: string, title: string} | null>(null);
  const [showDashboards, setShowDashboards] = useState(false);
  const [dashboards, setDashboards] = useState(company.dashboards);

  const onConfirmRevoke = async () => {
    if (!dashboardToRevoke) return;
    
    // Revocar
    const res = await revokeDashboardAccess(company.memberId, dashboardToRevoke.id);
    
    if (res.ok) {
        toast.success("Acceso revocado");
        setDashboards(prev => prev.filter(d => d.id !== dashboardToRevoke.id));
    } else {
        toast.error(res.error ?? "No se pudo revocar el acceso");
    }
    setDashboardToRevoke(null);
  };

  return (
    <>
      <button
        onClick={() => setShowDashboards(true)}
        className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium transition-colors hover:opacity-80"
        style={{
          background: isAdmin ? "var(--platform-success-dim)" : "var(--platform-surface-hover)",
          color: isAdmin ? "var(--platform-success)" : "var(--platform-fg)",
        }}
      >
        {company.name}
      </button>

      <Dialog open={showDashboards} onOpenChange={setShowDashboards}>
        <DialogContent
          className="sm:max-w-[425px] rounded-2xl border"
          style={{
            background: "var(--platform-surface)",
            borderColor: "var(--platform-border)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--platform-fg)" }}>Dashboards de {company.name}</DialogTitle>
            <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
              Lista de dashboards a los que tiene acceso en esta empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {dashboards && dashboards.length > 0 ? (
              <ul className="space-y-2">
                {dashboards.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between rounded-xl border p-3 text-sm"
                    style={{
                      borderColor: "var(--platform-border)",
                      color: "var(--platform-fg)",
                      background: "var(--platform-bg-elevated)",
                    }}
                  >
                    <span>{d.title}</span>
                    <button
                      onClick={() => setDashboardToRevoke({ id: d.id, title: d.title })}
                      className="rounded-lg p-1.5 transition-colors hover:opacity-80"
                      style={{ color: "var(--platform-fg-muted)" }}
                      title="Revocar acceso"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-sm py-4" style={{ color: "var(--platform-fg-muted)" }}>
                No hay dashboards disponibles.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowDashboards(false)}
              className="rounded-xl"
              style={{ background: "var(--platform-accent)", color: "var(--platform-accent-fg)" }}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dashboardToRevoke} onOpenChange={(open) => !open && setDashboardToRevoke(null)}>
        <DialogContent
          className="sm:max-w-[400px] rounded-2xl border"
          style={{
            background: "var(--platform-surface)",
            borderColor: "var(--platform-border)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--platform-fg)" }}>Revocar permisos</DialogTitle>
            <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
              ¿Estás seguro de quitar el acceso al dashboard <strong>{dashboardToRevoke?.title}</strong>? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDashboardToRevoke(null)}
              className="rounded-xl"
              style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
            >
              Cancelar
            </Button>
            <Button
              onClick={onConfirmRevoke}
              className="rounded-xl"
              style={{ background: "var(--platform-danger)", color: "#fff" }}
            >
              Revocar acceso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
