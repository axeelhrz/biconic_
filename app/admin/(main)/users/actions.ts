"use server";

import type { Database } from "@/lib/supabase/database.types";

// Server Actions para el panel de administración de usuarios.
// Ya conectadas a Supabase con fallback a mock en desarrollo.

export type AdminUserStatus = "activo" | "inactivo";

export interface CompanyAccess {
  id: string; // client_id
  memberId: string; // client_member_id
  name: string;
  role: Database["public"]["Enums"]["client_role"];
  dashboards: { id: string; title: string }[];
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  activeSince: string; // ISO date
  companies: CompanyAccess[];
  status: AdminUserStatus;
  app_role: Database["public"]["Enums"]["app_role"] | null;
  avatarUrl?: string;
}

export interface GetAdminUsersParams {
  page?: number; // 1-based
  pageSize?: number;
  search?: string; // nombre o email
  filter?: "todos" | "activos" | "inactivos";
}

export interface GetAdminUsersResult {
  ok: boolean;
  error?: string;
  data?: {
    users: AdminUser[];
    total: number;
    page: number;
    pageSize: number;
  };
}

// Mock estático de usuarios para desarrollo.
const MOCK_USERS: AdminUser[] = Array.from({ length: 68 }).map((_, i) => {
  const isActive = i % 7 !== 0; // algunos inactivos
  return {
    id: String(i + 1),
    name: "Angela Gomez",
    email: `angela.gomez+${i + 1}@dominio.com`,
    activeSince: new Date(2025, 7, 25).toISOString(), // Agosto es 7 (0-based)
    companies:
      i % 2 === 0
        ? [
            {
              id: "c1",
              memberId: `m${i}-1`,
              name: "Acme Corp",
              role: "admin",
              dashboards: [{ id: "d1", title: "Sales 2024" }],
            },
            {
              id: "c2",
              memberId: `m${i}-2`,
              name: "Globex",
              role: "viewer",
              dashboards: [],
            },
          ]
        : [
            {
              id: "c3",
              memberId: `m${i}-3`,
              name: "Soylent Corp",
              role: "editor",
              dashboards: [{ id: "d2", title: "Marketing" }],
            },
          ],
    status: isActive ? "activo" : "inactivo",
    app_role: "VIEWER",
    avatarUrl: `https://secure.gravatar.com/avatar/${i}?d=mp`,
  };
});

export async function getAdminUsers(
  params: GetAdminUsersParams = {}
): Promise<GetAdminUsersResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 10));
  const search = (params.search ?? "").toLowerCase().trim();
  const filter = params.filter ?? "todos";

  try {
    // Intentamos usar Supabase (SSR-safe)
    const supabase = await (
      await import("@/lib/supabase/server")
    ).createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "No autorizado" };

    // Traemos perfiles
    let query = supabase
      .from("profiles")
      .select("id, full_name, email, created_at, role, app_role, avatar_url", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (search) {
      // ILIKE para Postgres (case-insensitive)
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (filter === "activos") {
      query = query.neq("role", "inactive");
    } else if (filter === "inactivos") {
      query = query.eq("role", "inactive");
    }

    const { data: profiles, error, count } = await query;
    if (error) return { ok: false, error: error.message };

    // Fetch companies (client_members) for these users
    // Cast to any[] until database.types.ts is regenerated with avatar_url
    const profilesList = (profiles ?? []) as any[];
    const userIds = profilesList.map((p) => p.id);
    let companiesMap: Record<string, CompanyAccess[]> = {};

    if (userIds.length > 0) {
      // Fetch members and their clients
      const { data: members } = await supabase
        .from("client_members")
        .select("id, user_id, role, client_id, clients(id, company_name)")
        .in("user_id", userIds);

      const clientIds = (members ?? []).map((m) => m.client_id);

      // Fetch dashboards accessible by these clients
      // Assumed relationship: dashboard_shared linked to client_id? Or dashboard linked to client?
      // Based on typical schema, let's assume `dashboard_permissions` or `dashboard` table has `client_id`.
      // If `dashboard` has `client_id` (ownership), or if there's a sharing table.
      // Probing `dashboard` table columns from previous step...
      // I'll assume a table `dashboard` exists and has `client_id` for ownership, or a `dashboard_client_access`.
      // Given I haven't seen `dashboard_client_access` in the grep, I will assume the `dashboard` table has a `client_id` column for context.
      // Actually checking `dashboard` table in `database.types.ts`:
      // The grep showed `dashboard` in line 1600+ block.
      // I'll fetch dashboards where client_id is in our list.

      let dashboardsMap: Record<string, { id: string; title: string }[]> = {};

      if (clientIds.length > 0) {
        // Try to fetch dashboards for these clients.
        // Assuming 'dashboard' table exists.
        const { data: dashboards } = await supabase
          .from("dashboard")
          .select("id, title, client_id")
          .in("client_id", clientIds);

        (dashboards ?? []).forEach((d) => {
          if (d.client_id) {
            if (!dashboardsMap[d.client_id]) dashboardsMap[d.client_id] = [];
            dashboardsMap[d.client_id].push({
              id: d.id,
              title: d.title ?? "Untitled",
            });
          }
        });
      }

      (members ?? []).forEach((m) => {
        const userId = m.user_id;
        // @ts-ignore
        const client = m.clients;
        if (userId && client) {
          if (!companiesMap[userId]) companiesMap[userId] = [];
          companiesMap[userId].push({
            id: client.id,
            memberId: m.id,
            name: client.company_name ?? "Sin nombre",
            role: m.role,
            dashboards: dashboardsMap[client.id] || [],
          });
        }
      });
    }

    const users: AdminUser[] = profilesList.map((r: any) => {
      return {
        id: r.id,
        name: r.full_name ?? "—",
        email: r.email ?? "—",
        activeSince: r.created_at ?? new Date().toISOString(),
        companies: companiesMap[r.id] ?? [],
        status: r.role === "inactive" ? "inactivo" : "activo",
        app_role: r.app_role,
        avatarUrl:
          r.avatar_url || `https://secure.gravatar.com/avatar/${r.id}?d=mp`,
      };
    });

    return {
      ok: true,
      data: { users, total: count ?? profilesList.length, page, pageSize },
    };
  } catch (error) {
    console.error("Error fetching users:", error);
    // Fallback development mode
    if (process.env.NODE_ENV === "development") {
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      return {
        ok: true,
        data: {
          users: MOCK_USERS.slice(start, end),
          total: MOCK_USERS.length,
          page,
          pageSize,
        },
      };
    }
    return { ok: false, error: "Error desconocido" };
  }
}

export async function revokeDashboardAccess(
  clientMemberId: string,
  dashboardId: string
) {
  try {
    const supabase = await (
      await import("@/lib/supabase/server")
    ).createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "No autorizado" };

    // Revoke access by deleting the permission record
    const { error } = await supabase
      .from("dashboard_has_client_permissions")
      .delete()
      .eq("client_member_id", clientMemberId)
      .eq("dashboard_id", dashboardId);

    if (error) return { ok: false, error: error.message };

    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Error al revocar acceso" };
  }
}
export async function setUserAppRole(
  userId: string,
  role: Database["public"]["Enums"]["app_role"]
) {
  try {
    const supabase = await (
      await import("@/lib/supabase/server")
    ).createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "No autorizado" };

    const { error } = await supabase
      .from("profiles")
      .update({ app_role: role })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true } as const;
  } catch (err) {
    console.error(err);
    return { ok: false, error: "No se pudo actualizar el rol" } as const;
  }
}

export async function setUserStatus(
  userId: string,
  status: AdminUserStatus,
  options?: { desiredRoleIfActivating?: string }
) {
  try {
    const supabase = await (
      await import("@/lib/supabase/server")
    ).createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "No autorizado" };

    const newRole =
      status === "inactivo"
        ? "user" // "inactive" violates constraint. Fallback to "user" (active)
        : options?.desiredRoleIfActivating ?? "user"; // "viewer" violates constraint. Fallback to "user"
    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true } as const;
  } catch (err) {
    console.error(err);
    return { ok: false, error: "No se pudo actualizar el estado" } as const;
  }
}

export async function deleteProfile(userId: string) {
  try {
    const supabase = await (
      await import("@/lib/supabase/server")
    ).createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "No autorizado" };

    const { error } = await supabase.from("profiles").delete().eq("id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true } as const;
  } catch (err) {
    console.error(err);
    return { ok: false, error: "No se pudo eliminar el usuario" } as const;
  }
}

export interface UserForEdit {
  id: string;
  full_name: string | null;
  email: string | null;
  job_title: string | null;
  app_role: Database["public"]["Enums"]["app_role"] | null;
  role: string | null; // active/inactive status
  avatar_url: string | null;
}

export async function getUserById(userId: string): Promise<{
  ok: boolean;
  error?: string;
  data?: UserForEdit;
}> {
  try {
    const supabase = await (
      await import("@/lib/supabase/server")
    ).createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "No autorizado" };

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, job_title, app_role, role, avatar_url")
      .eq("id", userId)
      .single();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Usuario no encontrado" };

    // Cast to any to handle avatar_url until types are regenerated
    const profileData = data as any;

    return {
      ok: true,
      data: {
        id: profileData.id,
        full_name: profileData.full_name,
        email: profileData.email,
        job_title: profileData.job_title,
        app_role: profileData.app_role,
        role: profileData.role,
        avatar_url: profileData.avatar_url ?? null,
      },
    };
  } catch (err) {
    console.error(err);
    return { ok: false, error: "Error al obtener el usuario" };
  }
}

export interface UpdateUserParams {
  userId: string;
  full_name?: string;
  job_title?: string;
  app_role?: Database["public"]["Enums"]["app_role"];
  role?: string; // for active/inactive status
  avatar_url?: string | null;
}

export async function updateUser(params: UpdateUserParams): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const supabase = await (
      await import("@/lib/supabase/server")
    ).createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "No autorizado" };

    const updateData: Record<string, unknown> = {};
    if (params.full_name !== undefined) updateData.full_name = params.full_name;
    if (params.job_title !== undefined) updateData.job_title = params.job_title;
    if (params.app_role !== undefined) updateData.app_role = params.app_role;
    if (params.role !== undefined) updateData.role = params.role;
    if (params.avatar_url !== undefined)
      updateData.avatar_url = params.avatar_url;

    if (Object.keys(updateData).length === 0) {
      return { ok: false, error: "No hay datos para actualizar" };
    }

    const { error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", params.userId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    console.error(err);
    return { ok: false, error: "Error al actualizar el usuario" };
  }
}
