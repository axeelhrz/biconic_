import ConnectionsSection from "@/components/connections/ConnectionsSection";
import { getConnections } from "@/lib/actions/connections";

export default async function Page() {
  const connections = await getConnections();

  return (
    <>
      <ConnectionsSection initialConnections={connections} />
    </>
  );
}
