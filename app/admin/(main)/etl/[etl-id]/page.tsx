import { Button } from "@/components/ui/button";
import {
  Play,
  Settings,
  Save,
  Undo2,
  Redo2,
  Users,
} from "lucide-react";
import ETLEditor, { Widget } from "@/components/etl/etl-editor";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConnectionsPalette from "@/components/connections/ConnectionsPalette";
import EtlTitleWithEdit from "@/components/etl/EtlTitleWithEdit";
import ETLLogPanel from "@/components/etl/etl-log-panel";
import { getConnections } from "@/lib/actions/connections";
import { ETLPreviewProvider } from "@/components/etl/ETLPreviewContext";

type PageProps = {
  params: Promise<{ [key: string]: string }>;
};

export default async function AdminEtlByIdPage({ params }: PageProps) {
  const awaitedParams = await params;
  const etlId = awaitedParams["etl-id"];

  // Fetch etl data from Supabase
  const supabase = await createClient();

  // Role guard & Permission Check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Admin Check
  const { data: prof } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", user.id)
    .single();

  const role = (prof as any)?.app_role;

  // En el admin, solo permitimos APP_ADMIN o usuarios autorizados (aunque la ruta admin ya deberia estar protegida)
  // De todos modos, verificamos si es admin para ser exhaustivos
  if (role !== "APP_ADMIN") {
      // Si no es admin, redirigir a la vista de usuario normal (o prohibido)
      redirect(`/etl/${etlId}`);
  }

  const { data: etl, error } = await supabase
    .from("etl")
    .select("*")
    .eq("id", etlId)
    .single();

  if (error) {
    console.error("Error fetching etl:", error.message);
  }

  // Para Admin, permitimos ver todo. Si no existe, es "Nuevo".
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

  return (
    <div className="flex-1 w-full flex flex-col gap-4 p-8 box-border h-[calc(100vh-80px)]">
      <ETLPreviewProvider>
        {/* Secondary toolbar */}
        <div className="w-full border rounded-full bg-white px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3 text-gray-600">
             <div className="text-sm font-semibold text-gray-500 mr-2">Admin Mode</div>
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
              <Users className="h-4 w-4" /> Admin
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
        <div className="flex-1 overflow-hidden relative border rounded-3xl bg-white shadow-sm">
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
        </div>
      </ETLPreviewProvider>
    </div>
  );
}
