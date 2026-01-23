"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import AddClientPermissionModal from "./AddClientPermissionModal";

type Row =
  Database["public"]["Tables"]["dashboard_has_client_permissions"]["Row"];

type PermissionRecord = {
  id: string;
  created_at: string;
  is_active: boolean | null;
  permission_type:
    | Database["public"]["Enums"]["client_member_permission_types"]
    | null;
  member: {
    id: string;
    user_id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  dashboard: { id: string; title: string | null } | null;
};

export default function ClientPermissionsPanel({
  clientId,
  search,
}: {
  clientId: string;
  search: string;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PermissionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let ignore = false;
    async function load() {
      setLoading(true);
      setError(null);
      // Join permissions -> member -> profile and dashboard, scoped by client
      const { data, error } = await supabase
        .from("dashboard_has_client_permissions")
        .select(
          `id, created_at, is_active, permission_type,
           client_members!inner ( id, user_id, client_id ),
           dashboard!inner ( id, title, client_id )`
        )
        // 1. CONDICIÓN OBLIGATORIA: El dashboard debe ser de ESTE cliente
        .eq("dashboard.client_id", clientId)
        
        // 2. ELIMINADA: .eq("client_members.client_id", clientId) 
        // Al borrar esa línea, permites que aparezcan usuarios externos.
        
        .order("created_at", { ascending: false });

      if (ignore) return;
      if (error) {
        console.error("Error fetching permissions:", error);
        setError(error.message);
        setLoading(false);
        return;
      }

      console.log("Raw Permissions Data:", data);

      // fetch profile info for each unique user id to get name/email
      const userIds = Array.from(
        new Set(
          (data ?? [])
            .map(
              (r) => (r as any).client_members?.user_id as string | undefined
            )
            .filter((id): id is string => Boolean(id))
        )
      );
      
      console.log("Extracted User IDs:", userIds);

      let profiles: Record<
        string,
        { full_name: string | null; email: string | null }
      > = {};
      if (userIds.length) {
        const { data: profs, error: profError } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        
        if (profError) {
          console.error("Error fetching profiles:", profError);
        } else {
          console.log("Fetched Profiles:", profs);
          for (const p of profs ?? []) {
            profiles[p.id] = { full_name: p.full_name, email: p.email };
          }
        }
      }

      const mapped: PermissionRecord[] = (data ?? []).map((r) => {
        const cm = (r as any).client_members as {
          id: string;
          user_id: string;
        } | null;
        const dash = (r as any).dashboard as {
          id: string;
          title: string | null;
        } | null;
        const profile = cm?.user_id ? profiles[cm.user_id] : undefined;
        
        // Log if profile is missing for a user_id
        if (cm?.user_id && !profile) {
            console.warn(`Missing profile for user_id: ${cm.user_id}`);
        }

        return {
          id: (r as any).id as string,
          created_at: (r as any).created_at as string,
          is_active: (r as any).is_active ?? true,
          permission_type: (r as any).permission_type ?? null,
          member: cm
            ? {
                id: cm.id,
                user_id: cm.user_id,
                full_name: profile?.full_name ?? null,
                email: profile?.email ?? null,
              }
            : null,
          dashboard: dash,
        };
      });

      console.log("Mapped Permissions Rows:", mapped);

      setRows(mapped);
      setLoading(false);
    }
    load();
    return () => {
      ignore = true;
    };
  }, [clientId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = r.member?.full_name?.toLowerCase() ?? "";
      const email = r.member?.email?.toLowerCase() ?? "";
      const title = r.dashboard?.title?.toLowerCase() ?? "";
      return name.includes(q) || email.includes(q) || title.includes(q);
    });
  }, [rows, search]);

  async function handleSetActive(id: string, value: boolean) {
    const supabase = createClient();
    const prev = rows;
    setRows((cur) =>
      cur.map((r) => (r.id === id ? { ...r, is_active: value } : r))
    );
    const { error } = await supabase
      .from("dashboard_has_client_permissions")
      .update({ is_active: value })
      .eq("id", id);
    if (error) {
      setRows(prev);
      alert("No se pudo actualizar el estado del permiso: " + error.message);
    }
  }

  const actives = useMemo(
    () => filtered.filter((r) => r.is_active),
    [filtered]
  );
  const inactives = useMemo(
    () => filtered.filter((r) => !r.is_active),
    [filtered]
  );

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex justify-end">
         <AddClientPermissionModal clientId={clientId} onPermissionAdded={() => {
             window.location.reload(); 
         }} />
      </div>
      <section className="flex w-full flex-col gap-3">
        <h2 className="text-[20px] font-semibold text-[#00030A]">
          Permisos activos
        </h2>
        <div className="rounded-[14px] border border-[#D9DCE3] bg-white">
          <HeaderRow />
          {loading ? (
            <div className="p-4 text-sm text-[#636363]">Cargando…</div>
          ) : error ? (
            <div className="p-4 text-sm text-red-600">{error}</div>
          ) : actives.length === 0 ? (
            <div className="p-4 text-sm text-[#636363]">
              No hay permisos activos
            </div>
          ) : (
            actives.map((r) => (
              <DataRow
                key={r.id}
                rec={r}
                active
                onPrimary={() => handleSetActive(r.id, false)}
              />
            ))
          )}
        </div>
      </section>

      <section className="flex w-full flex-col gap-3">
        <h2 className="text-[20px] font-semibold text-[#00030A]">
          Permisos desactivados
        </h2>
        <div className="rounded-[14px] border border-[#D9DCE3] bg-white">
          <HeaderRow />
          {loading ? (
            <div className="p-4 text-sm text-[#636363]">Cargando…</div>
          ) : error ? (
            <div className="p-4 text-sm text-red-600">{error}</div>
          ) : inactives.length === 0 ? (
            <div className="p-4 text-sm text-[#636363]">
              No hay permisos desactivados
            </div>
          ) : (
            inactives.map((r) => (
              <DataRow
                key={r.id}
                rec={r}
                active={false}
                onPrimary={() => handleSetActive(r.id, true)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function HeaderRow() {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#D9DCE3] px-4 py-2 text-[12px] font-semibold text-[#54565B]">
      <div className="w-[220px]">Usuario</div>
      <div className="w-[220px]">Correo</div>
      <div className="w-[150px]">Activo desde</div>
      <div className="w-[220px]">Proyecto</div>
      <div className="w-[120px]">Estado</div>
      <div className="w-[120px]">Permisos</div>
      <div className="w-[80px]">Acciones</div>
    </div>
  );
}

function DataRow({
  rec,
  active = true,
  onPrimary,
}: {
  rec: PermissionRecord;
  active?: boolean;
  onPrimary: () => void;
}) {
  const date = new Date(rec.created_at);
  const fmt = date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
  const name = rec.member?.full_name ?? "—";
  const email = rec.member?.email ?? "—";
  const project = rec.dashboard?.title ?? "—";
  const perm = rec.permission_type ?? "VIEW";

  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#D9DCE3] px-4 py-3 text-[14px]">
      <div className="flex w-[220px] items-center gap-2">
        <div className="h-[35px] w-[35px] rounded-full bg-[#F5F5F5]" />
        <span className="text-[#282828]">{name}</span>
      </div>
      <div className="w-[220px] text-[#636363]">{email}</div>
      <div className="w-[150px] text-[#636363]">{fmt}</div>
      <div className="w-[220px]">
        <span className="inline-flex items-center rounded-full bg-[#E6E6E7] px-3 py-1 text-[12px] text-[#282828]">
          {project}
        </span>
      </div>
      <div className="w-[120px]">
        {active ? (
          <span className="inline-flex items-center rounded-full bg-[#E7FFE4] px-3 py-1 text-[14px] text-[#282828]">
            Activo
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-[#E6E6E7] px-3 py-1 text-[14px] text-[#282828]">
            Inactivo
          </span>
        )}
      </div>
      <div className="w-[120px]">
        <span className="inline-flex items-center rounded-full bg-[#E6E6E7] px-3 py-1 text-[12px] text-[#282828]">
          {perm}
        </span>
      </div>
      <div className="w-[80px]">
        <button
          onClick={onPrimary}
          className={cn(
            "inline-flex h-[34px] items-center justify-center rounded-full border px-3 text-[13px]",
            "border-[#0F5F4C] text-[#0F5F4C] hover:bg-[#F5FFFB]"
          )}
        >
          {active ? "Desactivar" : "Activar"}
        </button>
      </div>
    </div>
  );
}
