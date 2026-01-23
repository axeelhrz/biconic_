import { Button } from "@/components/ui/button";
import { Play, Settings, Save, Undo2, Redo2, Users } from "lucide-react";
import ETLEditor from "@/components/etl/etl-editor";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardEditor from "@/components/dashboard/DashboardEditor";

type PageProps = {
  params: Promise<{ [key: string]: string }>;
};

export default async function DashboardByIdPage({ params }: PageProps) {
  const awaitedParams = await params;
  const dashboardId = awaitedParams["dashboard-id"];

  // Fetch dashboard data from Supabase with ETL relationship
  const supabase = await createClient();
  // Ensure we have a user (middleware should already enforce auth)
  // Ensure we have a user (middleware should already enforce auth)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // 1. Fetch Profile for App Role (Global Admin Check)
  const { data: prof } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", user.id)
    .single();

  const appRole = (prof as any)?.app_role as
    | import("@/lib/supabase/database.types").Database["public"]["Enums"]["app_role"]
    | null;

  // 2. Fetch Dashboard
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
    .maybeSingle();

  if (error) {
    console.error("Error fetching dashboard:", error.message);
  }

  // 3. Permission Control
  // Permission Logic
  console.log("[Dashboard Page] Checking permissions. User:", user.id, "Role:", appRole);

  const isAccessAllowed =
    appRole === "APP_ADMIN" || (dashboard && dashboard.user_id === user.id);
  
  console.log("[Dashboard Page] isAccessAllowed (Admin/Owner):", isAccessAllowed, "Dashboard Owner:", dashboard?.user_id);

  if (!isAccessAllowed) {
      if (!dashboard) {
          console.log("[Dashboard Page] Dashboard not found or new. Role:", appRole);
          // If trying to create a NEW dashboard, only CREATOR authorized here (Admins handled above)
          if (appRole !== "CREATOR") {
             console.log("[Dashboard Page] Redirecting to /dashboard (Cleaner/Viewer cannot create)");
             redirect("/dashboard");
          }
      } else {
         // Existing Dashboard - Check explicit permissions
         const { data: memberParams } = await supabase
            .from("client_members")
            .select("id")
            .eq("user_id", user.id);
            
         const memberIds = memberParams?.map(m => m.id) || [];
         console.log("[Dashboard Page] Member IDs:", memberIds);
         
         if (memberIds.length > 0) {
             const { data: perm } = await supabase
                .from("dashboard_has_client_permissions")
                .select("permission_type")
                .eq("dashboard_id", dashboardId)
                .in("client_member_id", memberIds)
                .eq("is_active", true)
                .maybeSingle(); // Assuming one permission per user/dashboard for simplicity

             console.log("[Dashboard Page] Permission found:", perm);

             if (!perm) {
                console.log("[Dashboard Page] No permission found. Redirecting to /dashboard");
                redirect("/dashboard");
             }

             if (perm.permission_type === "VIEW") {
                 console.log("[Dashboard Page] VIEW permission. Redirecting to view mode.");
                 redirect(`/dashboard/${dashboardId}/view`);
             }
             
             console.log("[Dashboard Page] UPDATE permission. Allowing access.");
             // UPDATE -> Stay here
         } else {
             console.log("[Dashboard Page] No member IDs found. Redirecting.");
             redirect("/dashboard");
         }
      }

  } else {
    // Dashboard Not Found -> Creation Flow
    // Only allow CREATOR or APP_ADMIN to attempt creation
    if (appRole !== "CREATOR" && appRole !== "APP_ADMIN") {
        redirect("/dashboard");
    }
  }

  let ensured = dashboard as any;
  if (!ensured) {
    // Intentamos crear un row mínimo solo si el id es de tipo texto/uuid.
    // Si tu tabla usa id numérico autoincremental, ya estamos creando el row desde /api/dashboard
    try {
      // Auto-associate with first client found for this user
      const { data: member } = await supabase
        .from("client_members")
        .select("client_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (member?.client_id) {
        const payload: import("@/lib/supabase/database.types").Database["public"]["Tables"]["dashboard"]["Insert"] = {
          id: dashboardId,
          user_id: user.id,
          client_id: member.client_id,
        };
        const { data: created, error: insertErr } = await supabase
          .from("dashboard")
          .insert(payload)
          .select("*")
          .maybeSingle();
        if (!insertErr) {
          ensured = created;
        }
      } else {
        console.error("Cannot create dashboard: User has no client_id");
      }
    } catch (e: any) {
      console.error("Error creating dashboard:", e?.message);
      // Continuamos sin notFound; el editor puede manejar estado vacío
    }
  }

  const title = (ensured && (ensured as any).title) || dashboardId;
  const etlInfo = ensured?.etl;
  const etlName = etlInfo?.title || etlInfo?.name || null;
  return (
    <div className="flex-1 w-full flex flex-col gap-4">
      {/* Secondary toolbar */}
      <div className="w-full border rounded-full bg-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3 text-gray-600">
          <div className="inline-flex items-center gap-2">
            <div className="h-5 w-9 rounded-full bg-emerald-200 relative">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 ml-0.5 h-4 w-4 rounded-full bg-white shadow" />
            </div>
          </div>
          <Save className="h-4 w-4" />
          <Undo2 className="h-4 w-4" />
          <Redo2 className="h-4 w-4" />
          <Settings className="h-4 w-4" />
        </div>
        <div className="text-gray-600 text-sm">
          Dashboards /{" "}
          <span className="font-medium text-gray-900">{title}</span>
          {etlName && (
            <>
              {" "}
              / ETL:{" "}
              <span className="font-medium text-emerald-600">{etlName}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600 inline-flex items-center gap-2">
            <Users className="h-4 w-4" /> 3 personas
          </div>
          <Button className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white h-8 px-4 text-sm inline-flex items-center gap-2">
            <Play className="h-4 w-4" /> Ejecutar
          </Button>
          <button className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
            <Settings className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Editor with drag & drop canvas */}
      <DashboardEditor dashboardId={dashboardId} />
    </div>
  );
}
