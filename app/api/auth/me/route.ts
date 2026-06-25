import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { getJwtSecretKey } from "@/lib/auth/jwt-config";
import { proxyToBackend, shouldUseOwnBackend } from "@/lib/api/backend-proxy";

export async function GET(req: NextRequest) {
  if (!shouldUseOwnBackend()) {
    return NextResponse.json({ error: "Backend propio deshabilitado" }, { status: 404 });
  }

  let jwtRole: string | null = null;
  const accessToken = req.cookies.get("biconic_access")?.value;
  if (accessToken) {
    try {
      const { payload } = await jwtVerify(accessToken, getJwtSecretKey());
      jwtRole = typeof payload.app_role === "string" ? payload.app_role : null;
    } catch {
      jwtRole = null;
    }
  }

  const meRes = await proxyToBackend(req, "/auth/me", { method: "GET" });
  if (!meRes.ok) return meRes;

  let dbRole: string | null = null;
  try {
    const meData = (await meRes.clone().json()) as { app_role?: string };
    dbRole = typeof meData.app_role === "string" ? meData.app_role : null;
  } catch {
    return meRes;
  }

  const hasRefresh = Boolean(req.cookies.get("biconic_refresh")?.value);
  if (hasRefresh && dbRole && jwtRole !== dbRole) {
    const refreshRes = await proxyToBackend(req, "/auth/refresh", { method: "POST" });
    if (refreshRes.ok) {
      const body = await meRes.text();
      const response = new NextResponse(body, { status: meRes.status });
      const contentType = meRes.headers.get("content-type");
      if (contentType) response.headers.set("content-type", contentType);
      for (const c of refreshRes.headers.getSetCookie?.() ?? []) {
        response.headers.append("set-cookie", c);
      }
      return response;
    }
  }

  return meRes;
}
