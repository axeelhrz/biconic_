import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecretKey } from "@/lib/auth/jwt-config";
import { proxyToBackend } from "@/lib/api/backend-proxy";
import type { ServerAuthUser } from "@/lib/supabase/server-backend";

async function verifyAccessToken(token: string): Promise<ServerAuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    if (!payload.sub) return null;
    return {
      id: String(payload.sub),
      email: typeof payload.email === "string" ? payload.email : undefined,
      app_role: typeof payload.app_role === "string" ? payload.app_role : undefined,
    };
  } catch {
    return null;
  }
}

export type ResolvedServerAuth = {
  user: ServerAuthUser | null;
  /** Set-Cookie headers to forward when refresh succeeded */
  setCookieHeaders: string[];
};

/** Lee sesión JWT; si el access expiró, intenta refresh con la cookie de refresh. */
export async function resolveServerAuth(
  req?: NextRequest
): Promise<ResolvedServerAuth> {
  const jar = await cookies();
  const access = jar.get("biconic_access")?.value;
  if (access) {
    const user = await verifyAccessToken(access);
    if (user) return { user, setCookieHeaders: [] };
  }

  const hasRefresh = Boolean(jar.get("biconic_refresh")?.value);
  if (!hasRefresh || !req) {
    return { user: null, setCookieHeaders: [] };
  }

  const refreshRes = await proxyToBackend(req, "/auth/refresh", { method: "POST" });
  const setCookieHeaders = refreshRes.headers.getSetCookie?.() ?? [];
  if (!refreshRes.ok || setCookieHeaders.length === 0) {
    return { user: null, setCookieHeaders: [] };
  }

  const accessCookie = setCookieHeaders.find((c) => c.startsWith("biconic_access="));
  if (!accessCookie) {
    return { user: null, setCookieHeaders };
  }

  const raw = accessCookie.split(";")[0];
  const token = raw.slice("biconic_access=".length);
  const user = await verifyAccessToken(token);
  return { user, setCookieHeaders };
}
