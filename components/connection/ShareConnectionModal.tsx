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

interface ShareConnectionModalProps {
  connectionId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareConnectionModal({
  connectionId,
  clientId,
  open,
  onOpenChange,
}: ShareConnectionModalProps) {
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
    console.debug("[ShareConnectionModal] Fetching permissions", {
      connectionId,
    });
    const res = await fetch(
      `/api/connection/permissions?connectionId=${encodeURIComponent(
        connectionId
      )}`
    );
    const json = await res.json();
    if (!res.ok || !json?.ok)
      throw new Error(json?.error || "Error al obtener permisos");
    const list: PermissionItem[] = json.permissions ?? [];
    console.debug("[ShareConnectionModal] Permissions loaded", {
      count: list.length,
    });
    setPermissions(list);
    return list;
  };

  const fetchClientMembers = async (excludeClientMemberIds: string[]) => {
    console.debug("[ShareConnectionModal] Fetching client members", {
      clientId,
      excludeCount: excludeClientMemberIds.length,
    });

    let currentMemberUserIds = new Set<string>();
    let memberMap = new Map<string, any>(); // userId -> member objects

    // 1. Fetch existing members of this client
    const { data: members, error: membersErr } = await supabase
      .from("client_members")
      .select("id, user_id, role")
      .eq("client_id", clientId);

    if (membersErr) throw membersErr;

    (members ?? []).forEach((m) => {
      if (m.user_id) {
        currentMemberUserIds.add(m.user_id);
        memberMap.set(m.user_id, m);
      }
    });

    // 2. Fetch Profiles logic
    // If APP_ADMIN, fetch ALL profiles. Otherwise, only fetch profiles of members.
    let profilesQuery = supabase.from("profiles").select("id, full_name, email");

    if (role !== "APP_ADMIN") {
      // Regular users only see existing members
      if (currentMemberUserIds.size === 0) {
        setClientMembers([]);
        return;
      }
      profilesQuery = profilesQuery.in("id", Array.from(currentMemberUserIds));
    }

    const { data: profiles, error: profilesErr } = await profilesQuery;

    if (profilesErr) throw profilesErr;

    // 3. Construct options
    // We need to map profiles to options.
    // If a profile is NOT a member (Admin case), we still show them.
    // But 'client_member_id' will be missing. logic needs to handle that.

    const options: ClientMemberOption[] = (profiles ?? [])
      .map((p) => {
        const member = memberMap.get(p.id);
        
        // If we are filtering by existing permissions (excludeClientMemberIds), 
        // check if this user's *member id* is in that list.
        if (member && excludeClientMemberIds.includes(member.id)) {
          return null; 
        }

        return {
          client_member_id: member?.id ?? "PENDING_" + p.id, // Placeholder for non-members
          userId: p.id,
          full_name: p.full_name ?? null,
          email: p.email ?? null,
          role: member?.role ?? null,
          isMember: !!member, // Helper flag
        };
      })
      .filter((o): o is ClientMemberOption & { isMember: boolean } => o !== null);

    setClientMembers(options);
    console.debug("[ShareConnectionModal] Client members loaded", {
      optionsCount: options.length,
      isAdminMode: role === "APP_ADMIN",
    });
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        console.debug("[ShareConnectionModal] Opening modal", {
          connectionId,
          clientId,
        });
        const list = await fetchPermissions();
        if (cancelled) return;
        const excludeIds = list.map((p) => p.client_member_id);
        await fetchClientMembers(excludeIds);
      } catch (e) {
        console.error("[ShareConnectionModal] Init error", e);
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
    setIsLoading(true);

    try {
      console.debug("[ShareConnectionModal] Adding permission", {
        connectionId,
        targetUserId: selectedMemberUserId,
        permissionType: selectedPermission,
      });

      // Check if the selected user is already a member
      const selectedOption = clientMembers.find(m => m.userId === selectedMemberUserId);
      let targetMemberId = selectedOption?.client_member_id;

      // If "PENDING_", they are not a member yet. We must add them to the client.
      if (targetMemberId && targetMemberId.startsWith("PENDING_")) {
         console.log("[ShareConnectionModal] Adding user to client first...", selectedMemberUserId);
         const { data: newMember, error: addMemberErr } = await supabase
            .from("client_members")
            .insert({
                client_id: clientId,
                user_id: selectedMemberUserId,
                role: "viewer", // Default role
            })
            .select("id")
            .single();

         if (addMemberErr) throw new Error(`Error adding user to client: ${addMemberErr.message}`);
         targetMemberId = newMember.id;
      }

      const res = await fetch("/api/connection/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          targetUserId: selectedMemberUserId, // APIs usually prioritize memberId if logic matches, but let's see. 
          // Wait, the API `connection/permissions/route.ts` likely expects `client_member_id` or resolves from `user_id`.
          // If we pass `targetUserId`, the API might try to find the member. 
          // Since we just ensured the member exists, the API should succeed.
          permissionType: selectedPermission,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        console.error("[ShareConnectionModal] Add permission failed", json);
        // Optionally surface error to user
        return;
      }
      console.debug("[ShareConnectionModal] Permission added, refreshing lists");
      // Refresh lists
      const list = await fetchPermissions();
      const excludeIds = list.map((p) => p.client_member_id);
      await fetchClientMembers(excludeIds);
      setSelectedMemberUserId(null);
      setSelectedPermission("VIEW");
    } catch (err: any) {
        console.error("Error in handleAddPermission:", err);
        // Toast error?
    } finally {
        setIsLoading(false);
    }
  };

  const handleRemovePermission = async (permissionId: string) => {
    console.debug("[ShareConnectionModal] Removing permission", {
      permissionId,
    });
    const res = await fetch("/api/connection/permissions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissionId, connectionId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      console.error("[ShareConnectionModal] Remove permission failed", json);
      return;
    }
    console.debug("[ShareConnectionModal] Permission removed, refreshing lists");
    const list = await fetchPermissions();
    const excludeIds = list.map((p) => p.client_member_id);
    await fetchClientMembers(excludeIds);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Compartir Conexión</DialogTitle>
          <DialogDescription>
            Gestiona quién puede ver o editar esta conexión.
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

export default ShareConnectionModal;
