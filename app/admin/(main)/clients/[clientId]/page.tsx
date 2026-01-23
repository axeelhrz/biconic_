import ClientProjectsShell from "@/components/admin/clients/ClientProjectsShell";

export default async function Page({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  // Server-side: fetch client name and members count
  const supabase = await (await import("@/lib/supabase/server")).createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    // The middleware should redirect unauthenticated users already;
    // render nothing defensively.
    return null;
  }

  const { data } = await supabase
    .from("clients")
    .select("company_name, client_members(count)")
    .eq("id", clientId)
    .single();

  const clientName = data?.company_name ?? "Cliente";
  const membersCount = data?.client_members?.[0]?.count ?? 0;

  return (
    <div className="flex w-full justify-center">
      <ClientProjectsShell
        clientId={clientId}
        clientName={clientName}
        membersCount={membersCount}
      />
    </div>
  );
}
