import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getConnections } from "@/lib/actions/connections";
import EtlMetricsClient from "@/components/etl/EtlMetricsClient";
import type { Connection } from "@/components/connections/ConnectionsCard";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ [key: string]: string }>;
};

export default async function AdminEtlMetricsPage({ params }: PageProps) {
  const awaitedParams = await params;
  const etlId = awaitedParams["etl-id"];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: prof } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", user.id)
    .single();
  if ((prof as { app_role?: string })?.app_role !== "APP_ADMIN") {
    redirect(`/etl/${etlId}`);
  }

  const { data: etl } = await supabase
    .from("etl")
    .select("id, title, name, client_id")
    .eq("id", etlId)
    .maybeSingle();

  const etlTitle = (etl as { title?: string; name?: string })?.title
    || (etl as { title?: string; name?: string })?.name
    || etlId;
  const etlClientId = (etl as { client_id?: string | null })?.client_id ?? null;

  let connections: Connection[] = [];
  try {
    connections = await getConnections(etlClientId ? { clientId: etlClientId } : undefined);
  } catch (e) {
    console.error("Error loading connections for metrics:", e);
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] w-full">
      <EtlMetricsClient etlId={etlId} etlTitle={etlTitle} etlClientId={etlClientId} connections={connections} />
    </div>
  );
}
