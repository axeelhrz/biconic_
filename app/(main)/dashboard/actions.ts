"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase/database.types";

// --- Types ---

type AppPermissionType = Database["public"]["Enums"]["app_permission_type"];

// We'll define a return type for permissions that matches what the UI expects
export type DashboardPermissionItem = {
  id: string; // ID of the permission record
  permission_type: AppPermissionType;
  client_member_id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string; // app_role ideally
  image_url: string;
};

// --- Helper: Service Role Client for Admins ---
async function getServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !url) {
    throw new Error("Missing Supabase Service Role configuration");
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * ACTIONS
 */

/**
 * 1. Get Permissions for a Dashboard
 *    Fetches valid permissions from `dashboard_has_client_permissions`.
 *    Also resolves user details from `client_members` -> `profiles`.
 */
export async function getDashboardPermissionsAction(dashboardId: string) {
  const supabase = await createClient();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, error: "No autenticado" };

    // 1. Fetch permissions
    const { data: perms, error: permsErr } = await supabase
      .from("dashboard_has_client_permissions")
      .select("id, permission_type, client_member_id")
      .eq("dashboard_id", dashboardId);

    if (permsErr) {
      console.error("Error fetching dashboard permissions:", permsErr);
      return { ok: false, error: permsErr.message };
    }

    if (!perms || perms.length === 0) {
      return { ok: true, data: [] };
    }

    // 2. Fetch Client Members
    const clientMemberIds = perms.map((p) => p.client_member_id).filter(Boolean) as string[];

    if (clientMemberIds.length === 0) {
       return { ok: true, data: [] };
    }

    const { data: members, error: membersErr } = await supabase
      .from("client_members")
      .select("id, user_id, role")
      .in("id", clientMemberIds);

    if (membersErr) {
      console.error("Error fetching client members:", membersErr);
      throw membersErr;
    }

    // 3. Fetch Profiles
    const userIds = members?.map((m) => m.user_id).filter(Boolean) as string[];
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, full_name, email, app_role, role")
      .in("id", userIds);

    if (profilesErr) {
      console.error("Error fetching profiles:", profilesErr);
      throw profilesErr;
    }

    // 4. Map Data
    const memberMap = new Map((members ?? []).map((m) => [m.id, m]));
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    const mapped: DashboardPermissionItem[] = perms.map((item) => {
      // Manual type guard or casting because permission_type from DB can be string but we expect specific enum
      const permissionType = (item.permission_type === "UPDATE" ? "UPDATE" : "VIEW") as AppPermissionType;
      
      const member = item.client_member_id ? memberMap.get(item.client_member_id) : null;
      const profile = member ? profileMap.get(member.user_id) : null;

      return {
        id: item.id,
        permission_type: permissionType,
        client_member_id: item.client_member_id || "",
        user_id: member?.user_id ?? "",
        full_name: profile?.full_name || "Desconocido",
        email: profile?.email || "",
        role: profile?.app_role || (profile as any)?.role || "VIEWER",
        image_url: "/Image.svg",
      };
    });

    return { ok: true, data: mapped };
  } catch (e: any) {
    console.error("Exception in getDashboardPermissionsAction:", e);
    return { ok: false, error: e.message };
  }
}

/**
 * 2. Get Candidates (Client Members) who can be added
 *    Uses logic similar to ShareConnection/ShareEtl:
 *    - If User is Admin -> Fetch ALL profiles via Service Role (optional, or just fetch all client_members of the dashboard's client)
 *    - If Dashboard has no client_id (orphan) -> Use Owner's client
 */
export async function getDashboardCandidatesAction(dashboardId: string, ownerId: string) {
  const supabase = await createClient();

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return { ok: false, error: "No autenticado" };

    // 1. Check if user is APP_ADMIN
    const { data: currentUserProfile } = await supabase
      .from("profiles")
      .select("app_role")
      .eq("id", user.id)
      .single();

    const isAppAdmin = currentUserProfile?.app_role === "APP_ADMIN";

    // 2. Resolve Client ID for the Dashboard
    let scopeSupabase = supabase;
    if (isAppAdmin) {
      scopeSupabase = (await getServiceRoleClient()) as any;
    }

    // Get dashboard details
    const { data: dashboard, error: dashErr } = await scopeSupabase
      .from("dashboard")
      .select("client_id, user_id")
      .eq("id", dashboardId)
      .single();

    if (dashErr || !dashboard) {
      return { ok: false, error: "Dashboard no encontrado" };
    }

    let effectiveClientId = dashboard.client_id;
    
    // If orphan, try to find owner's client
    if (!effectiveClientId && ownerId) {
      const { data: ownerMember } = await scopeSupabase
        .from("client_members")
        .select("client_id")
        .eq("user_id", ownerId)
        .limit(1)
        .single();
        
      if (ownerMember) {
        effectiveClientId = ownerMember.client_id;
      }
    }
    
    let candidates: any[] = [];

    if (effectiveClientId) {
      // Fetch members of this client
       const { data: members, error: membersErr } = await scopeSupabase
        .from("client_members")
        .select("id, user_id, role")
        .eq("client_id", effectiveClientId);

       if (membersErr) throw membersErr;

       if (members && members.length > 0) {
           const userIds = members.map((m: any) => m.user_id);
           const { data: profiles, error: profilesErr } = await scopeSupabase
            .from("profiles")
            .select("id, full_name, email, app_role, job_title")
            .in("id", userIds);

            if (profilesErr) throw profilesErr;

            const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

            candidates = members.map((m: any) => {
                const p = profileMap.get(m.user_id);
                return {
                    client_member_id: m.id,
                    user_id: m.user_id,
                    full_name: p?.full_name || "Sin Nombre",
                    email: p?.email || "",
                    role: m.role || "viewer",
                    job_title: p?.job_title
                };
            });
       }

    }

    return { ok: true, data: candidates };

  } catch (e: any) {
    console.error("Error in getDashboardCandidatesAction:", e);
    return { ok: false, error: e.message };
  }
}



/**
 * 3. Add Permission
 */
export async function addDashboardPermissionAction(
  dashboardId: string, 
  targetUserId: string, 
  permissionType: AppPermissionType
) {
  const supabase = await createClient();
  
  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return { ok: false, error: "No autenticado" };

    // 1. Admin check
    const { data: currentUserProfile } = await supabase
      .from("profiles")
      .select("app_role")
      .eq("id", user.id)
      .single();
    const isAppAdmin = currentUserProfile?.app_role === "APP_ADMIN";

    let scopeSupabase = supabase;
    if (isAppAdmin) {
      scopeSupabase = (await getServiceRoleClient()) as any;
    }

    // 2. Get Dashboard Info (Client ID)
    const { data: dashboard } = await scopeSupabase
      .from("dashboard")
      .select("client_id, user_id")
      .eq("id", dashboardId)
      .single();

    if (!dashboard) return { ok: false, error: "Dashboard no encontrado" };

    let clientId = dashboard.client_id;
    if (!clientId && dashboard.user_id) {
       // Fallback: Owner's client
       const { data: ownerMember } = await scopeSupabase
        .from("client_members")
        .select("client_id")
        .eq("user_id", dashboard.user_id)
        .limit(1)
        .single();
       if (ownerMember) clientId = ownerMember.client_id;
    }

    if (!clientId) {
      return { ok: false, error: "No se pudo determinar el Cliente (Workspace) de este Dashboard" };
    }

    // 3. Ensure Target User is a Member of the Client
    let { data: targetMember } = await scopeSupabase
      .from("client_members")
      .select("id")
      .eq("client_id", clientId)
      .eq("user_id", targetUserId)
      .single();

    if (!targetMember) {
      // Add user to client if not exists (Only Logic for now, simplified)
      // Actually, if we are listing only existing members in Candidates, this block might be redundant 
      // BUT helpful if we ever allow adding by Email/Global Search.
      // Let's create member if missing.
      const { data: newMember, error: createError } = await scopeSupabase
        .from("client_members")
        .insert({
          client_id: clientId,
          user_id: targetUserId,
          role: "viewer"
        })
        .select("id")
        .single();

      if (createError) throw createError;
      targetMember = newMember;
    }

    // 4. Insert Permission
    const { error: insertErr } = await scopeSupabase
      .from("dashboard_has_client_permissions")
      .insert({
        dashboard_id: dashboardId,
        client_member_id: targetMember.id,
        permission_type: permissionType,
        is_active: true // Explicitly set active
      });

    if (insertErr) {
      // Handle duplicate violations gracefully if needed
      if (insertErr.code === '23505') { // Unique violation
        return { ok: false, error: "El usuario ya tiene permisos asignados." };
      }
      throw insertErr;
    }

    return { ok: true };

  } catch (e: any) {
    console.error("Error adding dashboard permission:", e);
    return { ok: false, error: e.message };
  }
}

/**
 * 4. Remove Permission
 */
export async function removeDashboardPermissionAction(permissionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if(!user) return { ok: false, error: "No autenticado" };

  try {
     // Admin Bypass Check
    const { data: profile } = await supabase.from("profiles").select("app_role").eq("id", user.id).single();
    const isAppAdmin = profile?.app_role === "APP_ADMIN";

    let scopeSupabase = supabase;
    if (isAppAdmin) {
      scopeSupabase = (await getServiceRoleClient()) as any;
    }

    const { error } = await scopeSupabase
      .from("dashboard_has_client_permissions")
      .delete()
      .eq("id", permissionId);

    if (error) throw error;
    return { ok: true };

  } catch (e: any) {
    console.error("Error removing permission:", e);
    return { ok: false, error: e.message };
  }
}

/**
 * 5. Get Dashboards (Owned + Shared)
 *    Replaces client-side fetching in DashboardGrid.
 */
export async function getDashboardsAction() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return { ok: false, error: "No autenticado" };

    try {
        // 1. Check App Admin Status
        const { data: profile } = await supabase
            .from("profiles")
            .select("app_role")
            .eq("id", user.id)
            .single();
        
        const isAppAdmin = profile?.app_role === "APP_ADMIN";
        let scopeSupabase = supabase;
        if (isAppAdmin) {
             scopeSupabase = (await getServiceRoleClient()) as any;
        }

        // 2. Determine Scope
        let ownedDashboards: any[] = [];
        let sharedDashboards: any[] = [];
        let clientAdminDashboards: any[] = [];

        // A. Owned / App Admin All
        let query = scopeSupabase.from("dashboard").select("*");
        if (!isAppAdmin) {
            query = query.eq("user_id", user.id);
        }

        const { data: owned, error: ownedErr } = await query;
        if (ownedErr) throw ownedErr;
        ownedDashboards = owned ?? [];

        // B. Client Admin Access & Shared Access (for non-AppAdmins)
        // If AppAdmin, they already have everything (line 400).
        if (!isAppAdmin) {
            // Get user's client member records and Check for Client Admin roles
            const { data: members } = await supabase
                .from("client_members")
                .select("id, client_id, role")
                .eq("user_id", user.id);
            
            if (members && members.length > 0) {
                // --- Shared Explicitly ---
                const memberIds = members.map(m => m.id);
                const { data: perms } = await supabase
                    .from("dashboard_has_client_permissions")
                    .select("dashboard_id")
                    .eq("is_active", true) 
                    .in("client_member_id", memberIds);
                
                if (perms && perms.length > 0) {
                    const dashboardIds = Array.from(new Set(perms.map(p => p.dashboard_id).filter(Boolean))) as string[];
                    if (dashboardIds.length > 0) {
                        const { data: shared, error: sharedErr } = await supabase
                            .from("dashboard")
                            .select("*")
                            .in("id", dashboardIds);
                        
                        if (sharedErr) throw sharedErr;
                        sharedDashboards = shared ?? [];
                    }
                }

                // --- Client Admin Access ---
                // Identify clients where user is 'admin' or 'ADMIN'
                const adminClientIds = members
                    .filter(m => (m.role as string) === 'admin' || (m.role as string) === 'ADMIN')
                    .map(m => m.client_id)
                    .filter(Boolean) as string[];

                if (adminClientIds.length > 0) {
                    const { data: clientDashes, error: clientErr } = await supabase
                        .from("dashboard")
                        .select("*")
                        .in("client_id", adminClientIds);

                    if (clientErr) throw clientErr;
                    clientAdminDashboards = clientDashes ?? [];
                }
            }
        }

        // 3. Merge Unique
        const allDashboardsMap = new Map();
        [...ownedDashboards, ...sharedDashboards, ...clientAdminDashboards].forEach((d: any) => {
            allDashboardsMap.set(d.id, d);
        });

        const allDashboards = Array.from(allDashboardsMap.values());

        // 4. Enrich with Owner Info
        const ownerIds = Array.from(new Set(allDashboards.map(d => d.user_id).filter(Boolean))) as string[];
        let ownerMap = new Map<string, string>();

        if (ownerIds.length > 0) {
             const { data: owners } = await scopeSupabase
                .from("profiles")
                .select("id, full_name")
                .in("id", ownerIds);
             
             owners?.forEach((o: any) => ownerMap.set(o.id, o.full_name ?? "Desconocido"));
        }

        // 5. Map to UI
        const mapped = allDashboards.map(row => {
            const ownerName = row.user_id ? ownerMap.get(row.user_id) : "Desconocido";
            const status = row.status === "Publicado" || row.status === "Borrador"
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
              owner: isAppAdmin || row.user_id !== user.id ? { fullName: ownerName } : undefined,
            };
        });

        return { ok: true, data: mapped };

    } catch (e: any) {
        console.error("Error in getDashboardsAction:", e);
        return { ok: false, error: e.message };
    }
}

// --- Public Access Management ---

export async function updateDashboardVisibilityAction(dashboardId: string, visibility: "public" | "private") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "No autorizado" };
  }
  
  const { error } = await supabase
    .from("dashboard")
    .update({ visibility })
    .eq("id", dashboardId);

  if (error) {
    return { ok: false, error: error.message };
  }
  
  return { ok: true };
}

export async function regenerateDashboardTokenAction(dashboardId: string) {
  const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "No autorizado" };
  }
  
  const { data, error } = await supabase
    .from("dashboard")
    .update({ share_token: crypto.randomUUID() })
    .eq("id", dashboardId)
    .select("share_token")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }
  
  return { ok: true, token: data.share_token };
}

export async function getDashboardPublicSettingsAction(dashboardId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("dashboard")
        .select("visibility, share_token")
        .eq("id", dashboardId)
        .single();
    
    if (error) return { ok: false, error: error.message };
    return { ok: true, data };
}
