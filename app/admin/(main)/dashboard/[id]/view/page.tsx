import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardViewer } from "@/components/dashboard/DashboardViewer";
import { verifyDashboardEditAccess } from "@/lib/admin/dashboard-security"; // Reusing security check

type PageProps = {
  params: Promise<{ [key: string]: string }>;
};

export default async function AdminDashboardViewPage({ params }: PageProps) {
  const awaitedParams = await params;
  const dashboardId = awaitedParams["id"];

  const supabase = await createClient();
  
  // 1. Auth & Role Check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("app_role")
      .eq("id", user.id)
      .single();
    
    const role = (prof as any)?.app_role as
      | import("@/lib/supabase/database.types").Database["public"]["Enums"]["app_role"]
      | null;
    
    // Strict Admin Check
    if (role !== "APP_ADMIN") {
      redirect("/dashboard");
    }
  } else {
    redirect("/auth/login");
  }

  // 2. Resource Access Check
  // Even though they are admin, we verify access logic just to be safe and consistent
  // (Or we can assume admins see everything, but 'verifyDashboardEditAccess' handles owner/admin checks)
  const canView = await verifyDashboardEditAccess(dashboardId, user.id);
  if (!canView) {
    redirect("/dashboard");
  }

  // 3. Render Viewer
  return <DashboardViewer dashboardId={dashboardId} />;
}
