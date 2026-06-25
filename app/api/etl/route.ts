import type { NextRequest } from "next/server";
import { proxyToBackend, shouldUseOwnBackend } from "@/lib/api/backend-proxy";

/** GET /api/etl — lista ETLs del usuario (proxy al backend Nest). */
export async function GET(req: NextRequest) {
  if (!shouldUseOwnBackend()) {
    return new Response(JSON.stringify({ error: "Backend propio deshabilitado" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  return proxyToBackend(req, "/etl", { method: "GET" });
}
