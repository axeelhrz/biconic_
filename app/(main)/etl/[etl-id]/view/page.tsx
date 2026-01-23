import EtlViewer from "@/components/etl/EtlViewer";

type PageProps = {
  params: Promise<{ [key: string]: string }>;
};

export default async function EtlViewPage({ params }: PageProps) {
  const awaitedParams = await params;
  const etlId = awaitedParams["etl-id"];

  return <EtlViewer etlId={etlId} />;
}
