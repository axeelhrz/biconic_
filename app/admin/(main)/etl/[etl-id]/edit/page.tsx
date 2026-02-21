import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getConnections } from "@/lib/actions/connections";
import EtlPageClient from "@/components/etl/EtlPageClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ [key: string]: string }>;
};

/**
 * Página específica para editar un ETL existente.
 * Muestra el editor (todas las secciones en una página) para modificar la configuración.
 * URL: /admin/etl/[id]/edit
 */
export default async function AdminEtlEditPage({ params }: PageProps) {
  const awaitedParams = await params;
  const etlId = awaitedParams["etl-id"];

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

  const role = (prof as { app_role?: string })?.app_role;

  if (role !== "APP_ADMIN") {
    redirect(`/etl/${etlId}`);
  }

  const { data: etl, error } = await supabase
    .from("etl")
    .select("*, client_id")
    .eq("id", etlId)
    .single();

  if (error || !etl) {
    redirect("/admin/etl");
  }

  const etlClientId = (etl as { client_id?: string })?.client_id ?? null;
  const title = (etl as { name?: string; title?: string })?.name || (etl as { name?: string; title?: string })?.title || etlId || "Editar ETL";

  let initialGuidedConfig: Record<string, unknown> | null = null;
  try {
    const layout = (etl as { layout?: { guided_config?: unknown } })?.layout;
    if (layout?.guided_config && typeof layout.guided_config === "object") {
      initialGuidedConfig = layout.guided_config as Record<string, unknown>;
    }
  } catch {
    // ignore
  }

  let connectionsData: Awaited<ReturnType<typeof getConnections>> = [];
  try {
    connectionsData = await getConnections(
      etlClientId ? { clientId: etlClientId } : undefined
    );
  } catch {
    // leave empty
  }

  return (
    <EtlPageClient
      etlId={etlId}
      title={title}
      connections={connectionsData}
      initialWidgets={null}
      initialZoom={undefined}
      initialGrid={undefined}
      initialEdges={undefined}
      initialGuidedConfig={initialGuidedConfig}
      forceEditorMode
    />
  );
}
