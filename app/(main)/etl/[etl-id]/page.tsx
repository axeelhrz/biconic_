import { Button } from "@/components/ui/button";
import {
  Play,
  Settings,
  Save,
  Undo2,
  Redo2,
  Users,
  Pencil,
} from "lucide-react";
import ETLEditor, { Widget } from "@/components/etl/etl-editor";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConnectionsPalette from "@/components/connections/ConnectionsPalette";
import EtlTitleWithEdit from "@/components/etl/EtlTitleWithEdit";
import ETLLogPanel from "@/components/etl/etl-log-panel";
import { getConnections } from "@/lib/actions/connections";
import { ETLPreviewProvider } from "@/components/etl/ETLPreviewContext";

type PageProps = {
  params: Promise<{ [key: string]: string }>;
};

export default async function EtlByIdPage({ params }: PageProps) {
  const awaitedParams = await params;
  const etlId = awaitedParams["etl-id"];

  // Fetch etl data from Supabase
  const supabase = await createClient();

  // Debug Log
  // The console.log for availableConnections is moved to where connectionsData is available,
  // as `availableConnections` is not// Placeholder to satisfy typescript until I verify the schema.
// Please ignore for now.iginal instruction's `} | null>(null);` part was syntactically incorrect and has been omitted.

  // Role guard & Permission Check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", user.id)
    .single();

  const role = (prof as any)?.app_role as
    | import("@/lib/supabase/database.types").Database["public"]["Enums"]["app_role"]
    | null;


  const { data: etl, error } = await supabase
    .from("etl")
    .select("*")
    .eq("id", etlId)
    .single();

  if (error) {
    console.error("Error fetching etl:", error.message);
  }

  // Permission Logic
  console.log("[ETL Page] Checking permissions for user:", user.id, "Role:", role);
  
  const isAppAdmin = role === "APP_ADMIN";
  const isOwner = etl && etl.user_id === user.id;
  
  console.log("[ETL Page] isAppAdmin:", isAppAdmin, "isOwner:", isOwner, "ETL Owner:", etl?.user_id);

  if (!isAppAdmin && !isOwner) {
      if (!etl) {
         console.log("[ETL Page] ETL not found or new. Role:", role);
         // Trying to create new ETL but not Admin/Creator
         if (role !== "CREATOR") {
             console.log("[ETL Page] Redirecting to /etl (Cleaner/Viewer cannot create)");
             redirect("/etl");
         }
      } else {
         // Existing ETL, check permissions
         const { data: memberParams } = await supabase
            .from("client_members")
            .select("id")
            .eq("user_id", user.id);
            
         const memberIds = memberParams?.map(m => m.id) || [];
         console.log("[ETL Page] Member IDs found:", memberIds);
         
         if (memberIds.length > 0) {
             const { data: perm } = await supabase
                .from("etl_has_permissions")
                .select("permission_type")
                .eq("etl_id", etlId)
                .in("client_member_id", memberIds)
                .maybeSingle();

             console.log("[ETL Page] Permission found:", perm);

             if (!perm) {
                console.log("[ETL Page] No active permission found. Redirecting to /etl");
                redirect("/etl");
             }

             if (perm.permission_type === "VIEW") {
                 console.log("[ETL Page] VIEW permission. Redirecting to /view");
                 redirect(`/etl/${etlId}/view`);
             }
             console.log("[ETL Page] UPDATE permission. Staying on editor.");
         } else {
             console.log("[ETL Page] No client member IDs. Redirecting to /etl");
             redirect("/etl");
         }
      }
  } else {
      console.log("[ETL Page] User is Admin or Owner. Access granted.");
  }
  // Si no existe el ETL, no devolvemos 404 para permitir crear desde el lienzo
  const title = etl?.name || etl?.title || etlId || "Nuevo ETL";
  let initialWidgets: Widget[] | null = null;
  let initialZoom: number | undefined = undefined;
  let initialGrid: number | undefined = undefined;
  let initialEdges:
    | Array<{ id: string; from: string; to: string }>
    | undefined = undefined;
  try {
    if ((etl as any)?.layout) {
      const layout = (etl as any).layout;
      if (layout && Array.isArray(layout.widgets)) {
        initialWidgets = layout.widgets as Widget[];
      }
      if (typeof layout?.zoom === "number") initialZoom = layout.zoom;
      if (typeof layout?.grid === "number") initialGrid = layout.grid;
      if (Array.isArray(layout?.edges)) initialEdges = layout.edges as any;
    }
  } catch {}

  const connectionsData = await getConnections();
  console.log("PARENT PAGE: Fetched connections:", connectionsData?.length);

  return (
    <div className="flex-1 w-full flex flex-col gap-4">
      <ETLPreviewProvider>
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
          <EtlTitleWithEdit etlId={etlId} initialTitle={title} />
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

        {/* Editor with connections palette on the left and log panel at the bottom */}
        <ETLEditor
          customLeftPanel={
            <ConnectionsPalette connections={connectionsData} />
          }
          customBottomPanel={<ETLLogPanel />}
          etlId={etlId}
          etlTitle={title}
          initialWidgets={initialWidgets}
          initialZoom={initialZoom}
          initialGrid={initialGrid}
          initialEdges={initialEdges}
          availableConnections={connectionsData}
        />
      </ETLPreviewProvider>
    </div>
  );
}
