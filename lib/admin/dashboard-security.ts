import { createClient } from "@/lib/supabase/server";

/**
 * Verifies if a user has edit access to a dashboard.
 * Access is granted if:
 * 1. User is the owner (dashboard.user_id)
 * 2. User is an admin of the client (client_members.role = 'admin')
 * 3. User has explicit UPDATE permission (dashboard_has_client_permissions)
 */
export async function verifyDashboardEditAccess(dashboardId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();

  // 0. Check Global App Admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", userId)
    .single();

  if (profile?.app_role === "APP_ADMIN") return true;

  // 1. Fetch Dashboard Info (Owner & Client ID)
  const { data: dashboard, error } = await supabase
    .from("dashboard")
    .select("user_id, client_id")
    .eq("id", dashboardId)
    .single();

  if (error || !dashboard) return false;

  // Check 1: Owner
  if (dashboard.user_id === userId) return true;

  // 2. Check Client Membership & Role
  const { data: membership } = await supabase
    .from("client_members")
    .select("id, role")
    .eq("client_id", dashboard.client_id)
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (!membership) return false;

  // Check 2: Client Admin
  if (membership.role === "admin") return true;

  // 3. Check Explicit Permissions for this Member on this Dashboard
  const { data: permission } = await supabase
    .from("dashboard_has_client_permissions")
    .select("permission_type")
    .eq("dashboard_id", dashboardId)
    .eq("client_member_id", membership.id)
    .eq("is_active", true)
    .single();

  // Check 3: Explicit Update Permission
  if (permission && permission.permission_type === "UPDATE") return true;

  return false;
}
