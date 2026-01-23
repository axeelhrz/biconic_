"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@radix-ui/react-dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";

type PermissionItem = {
  id: string;
  client_member_id: string;
  permission_type: "VIEW" | "UPDATE";
  is_active: boolean;
  created_at: string;
  client_member_role: string | null;
  user: { id: string; full_name: string | null; email: string | null } | null;
};

type ClientMemberOption = {
  client_member_id: string;
  userId: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

interface AdminShareDashboardModalProps {
  dashboardId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminShareDashboardModal({
  dashboardId,
  clientId,
  open,
  onOpenChange,
}: AdminShareDashboardModalProps) {
  const { role } = useUser();
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [clientMembers, setClientMembers] = useState<ClientMemberOption[]>([]);
  const [selectedMemberUserId, setSelectedMemberUserId] = useState<
    string | null
  >(null);
  const [selectedPermission, setSelectedPermission] = useState<
    "VIEW" | "UPDATE"
  >("VIEW");
  const [isLoading, setIsLoading] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const fetchPermissions = async (): Promise<PermissionItem[]> => {
    console.debug("[AdminShareDashboardModal] Fetching permissions", {
      dashboardId,
    });
    const res = await fetch(
      `/api/dashboard/permissions?dashboardId=${encodeURIComponent(
        dashboardId
      )}`
    );
    const json = await res.json();
    if (!res.ok || !json?.ok)
      throw new Error(json?.error || "Error al obtener permisos");
    const list: PermissionItem[] = json.permissions ?? [];
    console.debug("[AdminShareDashboardModal] Permissions loaded", {
      count: list.length,
    });
    setPermissions(list);
    return list;
  };

  const fetchClientMembers = async (excludeClientMemberIds: string[]) => {
    console.debug("[AdminShareDashboardModal] Fetching client members", {
      clientId,
      excludeCount: excludeClientMemberIds.length,
    });
    // Get client members for this client
    const { data: members, error: membersErr } = await supabase
      .from("client_members")
      .select("id, user_id, role")
      .eq("client_id", clientId);

    if (membersErr) throw membersErr;

    const filtered = (members ?? []).filter(
      (m) => !excludeClientMemberIds.includes(m.id)
    );
    const userIds = Array.from(
      new Set(filtered.map((m) => m.user_id))
    ) as string[];

    if (userIds.length === 0) {
      setClientMembers([]);
      return;
    }

    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    if (profilesErr) throw profilesErr;

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const options: ClientMemberOption[] = filtered.map((m) => {
      const p = profileById.get(m.user_id as string);
      return {
        client_member_id: m.id,
        userId: m.user_id as string,
        full_name: p?.full_name ?? null,
        email: p?.email ?? null,
        role: (m as any).role ?? null,
      };
    });

    setClientMembers(options);
    console.debug("[AdminShareDashboardModal] Client members loaded", {
      optionsCount: options.length,
    });
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        console.debug("[AdminShareDashboardModal] Opening modal", {
          dashboardId,
          clientId,
        });
        const list = await fetchPermissions();
        if (cancelled) return;
        const excludeIds = list.map((p) => p.client_member_id);
        await fetchClientMembers(excludeIds);
      } catch (e) {
        console.error("[AdminShareDashboardModal] Init error", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleAddPermission = async () => {
    if (!selectedMemberUserId) return;
    console.debug("[AdminShareDashboardModal] Adding permission", {
      dashboardId,
      targetUserId: selectedMemberUserId,
      permissionType: selectedPermission,
    });
    const res = await fetch("/api/dashboard/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dashboardId,
        targetUserId: selectedMemberUserId,
        permissionType: selectedPermission,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      console.error("[AdminShareDashboardModal] Add permission failed", json);
      // Optionally surface error to user
      return;
    }
    console.debug("[AdminShareDashboardModal] Permission added, refreshing lists");
    // Refresh lists
    const list = await fetchPermissions();
    const excludeIds = list.map((p) => p.client_member_id);
    await fetchClientMembers(excludeIds);
    setSelectedMemberUserId(null);
    setSelectedPermission("VIEW");
  };

  const handleRemovePermission = async (permissionId: string) => {
    console.debug("[AdminShareDashboardModal] Removing permission", {
      permissionId,
    });
    const res = await fetch("/api/dashboard/permissions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissionId, dashboardId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      console.error("[AdminShareDashboardModal] Remove permission failed", json);
      return;
    }
    console.debug(
      "[AdminShareDashboardModal] Permission removed, refreshing lists"
    );
    const list = await fetchPermissions();
    const excludeIds = list.map((p) => p.client_member_id);
    await fetchClientMembers(excludeIds);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Compartir dashboard (Admin)</DialogTitle>
          <DialogDescription>
            Gestiona quién puede ver o editar este dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Añadir personas</h3>
            <div className="flex items-center gap-2">
              <select
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none"
                value={selectedMemberUserId ?? ""}
                onChange={(e) =>
                  setSelectedMemberUserId(e.target.value || null)
                }
                disabled={isLoading || clientMembers.length === 0}
              >
                <option value="">Selecciona un miembro…</option>
                {clientMembers.map((m) => (
                  <option key={m.client_member_id} value={m.userId}>
                    {m.full_name || "Sin nombre"}{" "}
                    {m.email ? `(${m.email})` : ""}
                  </option>
                ))}
              </select>
              {(role === "CREATOR" || role === "APP_ADMIN") && (
                <select
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none"
                  value={selectedPermission}
                  onChange={(e) =>
                    setSelectedPermission((e.target.value as any) || "VIEW")
                  }
                  disabled={!selectedMemberUserId || isLoading}
                  aria-label="Permiso"
                >
                  <option value="VIEW">Visualizador</option>
                  <option value="UPDATE">Editor</option>
                </select>
              )}
              <Button
                onClick={handleAddPermission}
                disabled={!selectedMemberUserId || isLoading}
              >
                Añadir
              </Button>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Personas con acceso</h3>
            <div className="space-y-2 max-h-72 overflow-auto pr-1">
              {permissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay permisos configurados.
                </p>
              ) : (
                permissions.map((p) => {
                  const label =
                    p.permission_type === "UPDATE" ? "Editor" : "Visualizador";
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {p.user?.full_name || "Sin nombre"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.user?.email || "Sin email"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {label}
                        </span>
                        {p.permission_type !== "UPDATE" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleRemovePermission(p.id)}
                            title="Quitar acceso"
                          >
                            ×
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AdminShareDashboardModal;
