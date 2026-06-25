import { Widget } from "@/components/etl/etl-editor";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import { getAdminEtlPageDataFromDb } from "@/lib/admin/etl-repository";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
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

  let etlClientId: string | null = null;
  let title = etlId || "Nuevo ETL";
  let initialWidgets: Widget[] | null = null;
  let initialZoom: number | undefined = undefined;
  let initialGrid: number | undefined = undefined;
  let initialEdges:
    | Array<{ id: string; from: string; to: string }>
    | undefined = undefined;
  let initialGuidedConfig: Record<string, unknown> | null = null;

  if (shouldUseOwnBackend()) {
    const user = await getServerAuthUser();
    if (!user?.id) redirect("/auth/login");
    if (user.app_role !== "APP_ADMIN") redirect(`/etl/${etlId}`);

    const etlData = await getAdminEtlPageDataFromDb(etlId);
    if (etlData) {
      title = etlData.title;
      etlClientId = etlData.clientId;
      initialWidgets = (etlData.initialWidgets as Widget[] | null) ?? null;
      initialZoom = etlData.initialZoom;
      initialGrid = etlData.initialGrid;
      initialEdges = etlData.initialEdges;
      initialGuidedConfig = etlData.initialGuidedConfig;
    }
  } else {
    const supabase = await createClient();
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

    const role = (prof as any)?.app_role;

    if (role !== "APP_ADMIN") {
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

    etlClientId = (etl as any)?.client_id ?? null;
    title = etl?.name || etl?.title || etlId || "Nuevo ETL";
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
  }

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
