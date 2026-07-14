import { NextResponse } from "next/server";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import { queryEtlRunsFromDb } from "@/lib/admin/etl-runs-repository";

/** GET /api/etl/runs/:runId — estado de una ejecución ETL. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  if (!shouldUseOwnBackend()) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  const { runId } = await params;
  if (!runId) {
    return NextResponse.json({ error: "runId requerido" }, { status: 400 });
  }

  try {
    const rows = await queryEtlRunsFromDb({
      eq: { id: runId },
      limit: 1,
    });
    const row = rows[0] ?? null;
    if (!row) {
      return NextResponse.json({ error: "Ejecución no encontrada" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    const status =
      message === "No autorizado" || message === "Solo administradores" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
