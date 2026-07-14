import type { NextRequest } from "next/server";
import { proxyToBackend, shouldUseOwnBackend } from "@/lib/api/backend-proxy";

/** PATCH /api/connections/:id */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!shouldUseOwnBackend()) {
    return new Response(JSON.stringify({ error: "Backend propio deshabilitado" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  const { id } = await params;
  return proxyToBackend(req, `/connections/${id}`, { method: "PATCH" });
}
