import { Widget } from "@/components/etl/etl-editor";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getConnections } from "@/lib/actions/connections";
import EtlPageClient from "@/components/etl/EtlPageClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ [key: string]: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AdminEtlByIdPage({ params, searchParams }: PageProps) {
  const awaitedParams = await params;
  const awaitedSearch = await searchParams;
  const etlId = awaitedParams["etl-id"];
  const runParam = awaitedSearch?.run;
  const initialGuidedStep = runParam === "1" ? "ejecutar" as const : undefined;

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
    .select("*, client_id")
    .eq("id", etlId)
    .single();

  if (error) {
    console.error("Error fetching etl:", error.message);
  }

  const etlClientId = (etl as any)?.client_id ?? null;

  // Para Admin, permitimos ver todo. Si no existe, es "Nuevo".
  const title = etl?.name || etl?.title || etlId || "Nuevo ETL";
  let initialWidgets: Widget[] | null = null;
  let initialZoom: number | undefined = undefined;
  let initialGrid: number | undefined = undefined;
  let initialEdges:
    | Array<{ id: string; from: string; to: string }>
    | undefined = undefined;
  let initialGuidedConfig: Record<string, unknown> | null = null;
  try {
    if ((etl as any)?.layout) {
      const layout = (etl as any).layout;
      if (layout && Array.isArray(layout.widgets)) {
        initialWidgets = layout.widgets as Widget[];
      }
      if (typeof layout?.zoom === "number") initialZoom = layout.zoom;
      if (typeof layout?.grid === "number") initialGrid = layout.grid;
      if (Array.isArray(layout?.edges)) initialEdges = layout.edges as any;
      if (layout?.guided_config && typeof layout.guided_config === "object") {
        initialGuidedConfig = layout.guided_config as Record<string, unknown>;
      }
    }
  } catch {}

  let connectionsData: Awaited<ReturnType<typeof getConnections>> = [];
  try {
    connectionsData = await getConnections(
      etlClientId ? { clientId: etlClientId } : undefined
    );
  } catch (e) {
    console.error("Error cargando conexiones (puede ser timeout):", e);
    // Dejar array vacío para que la página cargue; el usuario puede recargar
  }

  return (
    <EtlPageClient
      etlId={etlId}
      title={title}
      connections={connectionsData}
      initialWidgets={initialWidgets}
      initialZoom={initialZoom}
      initialGrid={initialGrid}
      initialEdges={initialEdges}
      initialGuidedStep={initialGuidedStep}
      initialGuidedConfig={initialGuidedConfig}
    />
  );
}
