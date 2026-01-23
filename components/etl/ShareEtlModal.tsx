"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useUser } from "@/hooks/useUser";
import {
  getEtlPermissionsAction,
  getEtlCandidatesAction,
  addEtlPermissionAction,
  removeEtlPermissionAction,
} from "@/app/(main)/etl/actions";

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

interface ShareEtlModalProps {
  etlId: string;
  clientId: string;
  ownerId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareEtlModal({
  etlId,
  clientId,
  ownerId,
  open,
  onOpenChange,
}: ShareEtlModalProps) {
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

  const fetchPermissions = async (): Promise<PermissionItem[]> => {
    const { ok, data, error } = await getEtlPermissionsAction(etlId);
    if (!ok) {
        console.error("Error fetching permissions:", error);
        return [];
    }
    const list = (data || []) as PermissionItem[];
    setPermissions(list);
    return list;
  };

  const fetchCandidates = async (excludeClientMemberIds: string[]) => {
      const { ok, data, error } = await getEtlCandidatesAction(etlId, ownerId);
      if (!ok) {
          console.error("Error fetching candidates:", error);
          setClientMembers([]);
          return;
      }
      
      const all = data || [];
      // Filter out existing permissions
      const filtered = all.filter((c: any) => !excludeClientMemberIds.includes(c.client_member_id));
      setClientMembers(filtered);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        const list = await fetchPermissions();
        if (cancelled) return;
        const excludeIds = list.map((p) => p.client_member_id);
        await fetchCandidates(excludeIds);
      } catch (e) {
        console.error("[ShareEtlModal] Init error", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, etlId]);

  const handleAddPermission = async () => {
    if (!selectedMemberUserId) return;
    setIsLoading(true);

    try {
      const { ok, error } = await addEtlPermissionAction(etlId, selectedMemberUserId, selectedPermission);
      
      if (!ok) {
        console.error("[ShareEtlModal] Add permission failed", error);
        alert(`Error: ${error}`);
        return;
      }

      // Refresh
      const list = await fetchPermissions();
      const excludeIds = list.map((p) => p.client_member_id);
      await fetchCandidates(excludeIds);

      setSelectedMemberUserId(null);
      setSelectedPermission("VIEW");
    } catch (err: any) {
        console.error("Error in handleAddPermission:", err);
    } finally {
        setIsLoading(false);
    }
  };

  const handleRemovePermission = async (permissionId: string) => {
    if (!confirm("¿Estás seguro de quitar el permiso?")) return;
    
    const { ok, error } = await removeEtlPermissionAction(permissionId);

    if (!ok) {
      console.error("[ShareEtlModal] Remove permission failed", error);
      alert(`Error: ${error}`);
      return;
    }
    
    const list = await fetchPermissions();
    const excludeIds = list.map((p) => p.client_member_id);
    await fetchCandidates(excludeIds);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Compartir ETL</DialogTitle>
          <DialogDescription>
            Gestiona quién puede ver o editar este ETL.
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
                <option value="">
                    {clientMembers.length === 0 
                        ? (isLoading ? "Cargando..." : "No hay miembros disponibles") 
                        : "Selecciona un miembro…"}
                </option>
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
                {isLoading ? "..." : "Añadir"}
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

export default ShareEtlModal;
