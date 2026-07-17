import { NextResponse } from "next/server";
import { listViewerAccessibleDashboardsFromDb } from "@/lib/viewer/accessible-dashboards-repository";

/**
 * Lista unificada para el rol viewer: dashboards accesibles + empresas del usuario.
 * Sustituye las múltiples consultas del shim que fallaban por columnas legacy (is_active).
 */
export async function GET() {
  try {
    const data = await listViewerAccessibleDashboardsFromDb();
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    const status = message === "No autorizado" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
