"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  getAdminUsers,
  type AdminUser,
  type CompanyAccess,
  setUserAppRole,
  setUserStatus,
  deleteProfile,
} from "@/app/admin/(main)/users/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, PencilLine, Trash2 } from "lucide-react";
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
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await getAdminUsers({ page, pageSize, search, filter });
      setLoading(false);
      if (res.ok && res.data) {
        setRows(res.data.users);
        setTotal(res.data.total);
      } else if (!res.ok) {
        toast.error(res.error ?? "No se pudieron cargar los usuarios");
      }
    })();
  }, [page, pageSize, search, filter]);

  // Mantener la tabla pegada al diseño pero responsiva
  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex w-full items-center justify-between">
        <h2 className="text-[20px] font-semibold" style={{ color: "var(--platform-fg)" }}>
          Usuarios
        </h2>
        <Button
          variant="outline"
          className="h-[34px] rounded-full"
          style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}
          onClick={() => exportCSV(rows)}
        >
          Exportar
        </Button>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="min-w-[800px] w-full table-fixed">
          <thead style={{ background: "var(--platform-bg-elevated)" }}>
            <tr className="text-left text-[12px] font-semibold" style={{ color: "var(--platform-fg-muted)" }}>
              <Th className="w-[240px]">Usuario</Th>
              <Th className="w-[240px]">Correo</Th>
              <Th className="w-[160px]">Activo desde</Th>
              <Th className="w-[260px]">Empresas</Th>
              <Th className="w-[140px]">Estado</Th>
              <Th className="w-[140px]">Rol</Th>
              <Th className="w-[100px]">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <SkeletonRows />}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
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
                  <Td style={{ borderColor: "var(--platform-border)" }}>
                    <div className="flex items-center gap-2">
                      <div
                        className="relative h-[35px] w-[35px] overflow-hidden rounded-full"
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
                    <button
                      className={cn(
                        "rounded-full px-3 py-1 text-[14px] font-medium transition-colors hover:opacity-90",
                        u.status === "activo" && "bg-[var(--platform-success-dim)]",
                        u.status !== "activo" && "bg-[var(--platform-surface-hover)]"
                      )}
                      style={{
                        color: u.status === "activo" ? "var(--platform-success)" : "var(--platform-fg-muted)",
                      }}
                      onClick={async () => {
                        const next =
                          u.status === "activo" ? "inactivo" : "activo";
                        const prev = u.status;
                        setRows((r) =>
                          r.map((x) =>
                            x.id === u.id ? { ...x, status: next } : x
                          )
                        );
                        const res = await setUserStatus(u.id, next);
                        if (!res.ok) {
                          setRows((r) =>
                            r.map((x) =>
                              x.id === u.id ? { ...x, status: prev } : x
                            )
                          );
                          toast.error(
                            res.error ?? "No se pudo actualizar el estado"
                          );
                        } else {
                          toast.success("Estado actualizado");
                        }
                      }}
                    >
                      {u.status === "activo" ? "Activo" : "Inactivo"}
                    </button>
                  </Td>
                  <Td style={{ borderColor: "var(--platform-border)" }}>
                    <select
                      value={u.app_role || ""}
                      className="rounded-full px-3 py-1 text-[12px] font-medium focus:outline-none"
                      style={{
                        background: "var(--platform-surface-hover)",
                        color: "var(--platform-fg)",
                        border: "1px solid var(--platform-border)",
                      }}
                      onChange={async (e) => {
                        const nextRole = e.target.value as AppRole;
                        const prevRole = u.app_role;
                        
                        setRows((r) =>
                          r.map((x) =>
                            x.id === u.id ? { ...x, app_role: nextRole } : x
                          )
                        );
                        
                        const res = await setUserAppRole(u.id, nextRole);
                        if (!res.ok) {
                          setRows((r) =>
                            r.map((x) =>
                              x.id === u.id
                                ? { ...x, app_role: prevRole }
                                : x
                            )
                          );
                          toast.error(
                            res.error ?? "No se pudo actualizar el rol"
                          );
                        } else {
                          toast.success("Rol actualizado");
                        }
                      }}
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="CREATOR">Creator</option>
                      <option value="APP_ADMIN">App Admin</option>
                    </select>
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
                          className="border"
                          style={{
                            background: "var(--platform-surface)",
                            borderColor: "var(--platform-border)",
                          }}
                        >
                          <DialogHeader>
                            <DialogTitle style={{ color: "var(--platform-fg)" }}>Detalles de usuario</DialogTitle>
                            <DialogDescription style={{ color: "var(--platform-fg-muted)" }}>
                              {u.name} — {u.email}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="mt-2 text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                            <p>
                              <strong>Rol:</strong> {u.app_role || "Sin rol"}
                            </p>
                            <p>
                              <strong>Estado:</strong>{" "}
                              {u.status === "activo" ? "Activo" : "Inactivo"}
                            </p>
                            <div className="mt-2">
                                <strong>Empresas:</strong>
                                <ul className="ml-4 mt-1 list-disc">
                                {u.companies?.map(c => (
                                    <li key={c.id}>
                                        {c.name} ({c.role})
                                    </li>
                                )) || "Ninguna"}
                                </ul>
                            </div>
                            <p className="mt-2">
                              <strong>Activo desde:</strong>{" "}
                              {formatDate(u.activeSince)}
                            </p>
                          </div>
                          <DialogFooter>
                            <Button
                              onClick={() => setSelected(null)}
                              style={{ background: "var(--platform-accent)", color: "#08080b" }}
                              className="hover:opacity-90"
                            >
                              Cerrar
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <IconButton label="Editar" onClick={() => router.push(`/admin/users/${u.id}/edit`)}>
                        <PencilLine className="h-5 w-5" />
                      </IconButton>
                      <IconButton
                        label="Eliminar"
                        onClick={async () => {
                          if (!confirm("¿Eliminar este usuario?")) return;
                          const prev = rows;
                          setRows((r) => r.filter((x) => x.id !== u.id));
                          const res = await deleteProfile(u.id);
                          if (!res.ok) {
                            setRows(prev);
                            toast.error(
                              res.error ?? "No se pudo eliminar el usuario"
                            );
                          } else {
                            toast.success("Usuario eliminado");
                          }
                        }}
                      >
                        <Trash2 className="h-5 w-5" />
                      </IconButton>
                    </div>
                  </Td>
                </tr>
              ))}
          </tbody>
        </table>
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
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <th className={cn("whitespace-nowrap px-4 py-2", className)}>{children}</th>
  );
}

function Td({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <td className={cn("whitespace-nowrap px-4 py-3", className)}>{children}</td>
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
    <div className="flex items-center justify-center gap-4">
      <Button
        variant="ghost"
        className="h-[30px] rounded-xl text-[#33353B]"
        onClick={onPrev}
        disabled={page <= 1}
      >
        Anterior
      </Button>

      <div className="flex items-center gap-3">
        {numbers.map((n) => (
          <button
            key={n}
            onClick={() => onGo(n)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl text-[14px] font-semibold",
              n === page ? "bg-[#282828] text-white" : "bg-white text-[#00030A]"
            )}
          >
            {n}
          </button>
        ))}
      </div>

      <Button
        variant="ghost"
        className="h-[30px] rounded-xl text-[#0F5F4C]"
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
          {Array.from({ length: 7 }).map((__, j) => (
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
          className="sm:max-w-[425px] border"
          style={{
            background: "var(--platform-surface)",
            borderColor: "var(--platform-border)",
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
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                    style={{
                      borderColor: "var(--platform-border)",
                      color: "var(--platform-fg)",
                    }}
                  >
                    <span>{d.title}</span>
                    <button
                      onClick={() => setDashboardToRevoke({ id: d.id, title: d.title })}
                      className="transition-colors hover:opacity-80"
                      style={{ color: "var(--platform-fg-muted)" }}
                      title="Revocar acceso"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                No hay dashboards disponibles.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowDashboards(false)}
              style={{ background: "var(--platform-accent)", color: "#08080b" }}
              className="hover:opacity-90"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dashboardToRevoke} onOpenChange={(open) => !open && setDashboardToRevoke(null)}>
        <DialogContent
          className="sm:max-w-[400px] border"
          style={{
            background: "var(--platform-surface)",
            borderColor: "var(--platform-border)",
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
              style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmRevoke}
              className="hover:opacity-90"
            >
              Revocar acceso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
