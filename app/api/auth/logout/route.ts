import { NextResponse, type NextRequest } from "next/server";
import { proxyToBackend, shouldUseOwnBackend } from "@/lib/api/backend-proxy";

export async function POST(req: NextRequest) {
  if (!shouldUseOwnBackend()) {
    return NextResponse.json({ error: "Backend propio deshabilitado" }, { status: 404 });
  }
  return proxyToBackend(req, "/auth/logout", { method: "POST" });
}
