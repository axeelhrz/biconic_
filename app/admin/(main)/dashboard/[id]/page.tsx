import { Button } from "@/components/ui/button";
import { Play, Settings, Save, Undo2, Redo2, Users } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboardEditor } from "@/components/admin/dashboard/AdminDashboardEditor";
import { DashboardHeaderDetails } from "@/components/admin/dashboard/DashboardHeaderDetails";
import { verifyDashboardEditAccess } from "@/lib/admin/dashboard-security";

type PageProps = {
  params: Promise<{ [key: string]: string }>;
};

export default async function AdminDashboardByIdPage({ params }: PageProps) {
  const awaitedParams = await params;
  const dashboardId = awaitedParams["id"]; // Route is [id], so param is 'id'

  // Fetch dashboard data from Supabase with ETL relationship
  const supabase = await createClient();
  // Ensure we have a user (middleware should already enforce auth)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Role guard: only APP_ADMIN can access this specific admin editor route
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

  const { data: dashboard, error } = await supabase
    .from("dashboard")
    .select(
      `
      *,
      etl:etl_id (
        id,
        title,
        name
      )
    `
    )
    .eq("id", dashboardId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching dashboard (Admin):", error.message);
  }

  // Permission Check: Owner OR Admin OR Explicit
  if (user?.id) {
    const canEdit = await verifyDashboardEditAccess(dashboardId, user.id);
    if (!canEdit) {
      redirect("/dashboard");
    }
  }
  
  // If not found, we just proceed. The Editor handles "new" definitions via state if needed,
  // or we can handle "not found" UI. For now, we trust the editor to initialize empty.
  const ensured = dashboard;


  const title = (ensured && (ensured as any).title) || dashboardId;
  const etlInfo = ensured?.etl;
  const etlName = etlInfo?.title || etlInfo?.name || null;
  return (
    <div className="flex-1 w-full flex flex-col gap-4">
      {/* Secondary toolbar - Admin View */}
      <div className="w-full border rounded-full bg-white px-4 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 text-gray-600">
          <div className="inline-flex items-center gap-2">
            <div className="h-5 w-9 rounded-full bg-purple-200 relative">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 ml-0.5 h-4 w-4 rounded-full bg-white shadow" />
            </div>
          </div>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">ADMIN EDITOR</span>
          <Save className="h-4 w-4" />
          <Undo2 className="h-4 w-4" />
          <Redo2 className="h-4 w-4" />
          <Settings className="h-4 w-4" />
        </div>
        <div className="text-gray-600 text-sm">
          Admin / Dashboards /{" "}
          <DashboardHeaderDetails 
            dashboardId={dashboardId} 
            title={title}
            etlName={etlName} 
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600 inline-flex items-center gap-2">
            <Users className="h-4 w-4" /> Admin Access
          </div>
          <Button className="rounded-full bg-purple-600 hover:bg-purple-700 text-white h-8 px-4 text-sm inline-flex items-center gap-2">
            <Play className="h-4 w-4" /> Ejecutar (Admin)
          </Button>
          <button className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
            <Settings className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Admin Editor with drag & drop canvas */}
      <AdminDashboardEditor dashboardId={dashboardId} />
    </div>
  );
}
