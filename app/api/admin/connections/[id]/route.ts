import { NextResponse } from "next/server";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import {
  deleteConnectionFromDb,
  getConnectionDetailFromDb,
} from "@/lib/admin/connections-repository";

export const dynamic = "force-dynamic";

/** GET /api/admin/connections/:id — detalle para Vista previa / Configurar */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!shouldUseOwnBackend()) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  const { id } = await params;
  try {
    const row = await getConnectionDetailFromDb(id);
    if (!row) {
      return NextResponse.json({ error: "Conexión no encontrada" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (err) {
    console.error("GET /api/admin/connections/[id]:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}

/** DELETE /api/admin/connections/:id */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!shouldUseOwnBackend()) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  const { id } = await params;
  try {
    await deleteConnectionFromDb(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/connections/[id]:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al eliminar" },
      { status: 500 }
    );
  }
}
