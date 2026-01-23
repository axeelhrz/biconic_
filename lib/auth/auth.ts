import { createClient } from "../supabase/client";

export async function checkUserRole(allowedRoles: string[]) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return profile?.role && allowedRoles.includes(profile.role);
}
