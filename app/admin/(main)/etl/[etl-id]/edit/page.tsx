import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ [key: string]: string }>;
};

/**
 * La vista "Editor del ETL" (todas las secciones en una página) fue eliminada.
 * Redirigir siempre al flujo por pasos en /admin/etl/[id].
 */
export default async function AdminEtlEditPage({ params }: PageProps) {
  const awaitedParams = await params;
  const etlId = awaitedParams["etl-id"];
  redirect(`/admin/etl/${etlId}`);
}
