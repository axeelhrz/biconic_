import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getBackendApiUrl } from "@/lib/api/backend-config";
import { getJwtSecretKey } from "@/lib/auth/jwt-config";

type JwtPayload = {
  sub?: string;
  app_role?: string;
};

async function verifyAccessToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

async function tryRefreshSession(
  request: NextRequest
): Promise<{ payload: JwtPayload | null; setCookieHeaders: string[] }> {
  const refresh = request.cookies.get("biconic_refresh")?.value;
  if (!refresh) return { payload: null, setCookieHeaders: [] };

  try {
    const res = await fetch(`${getBackendApiUrl()}/auth/refresh`, {
      method: "POST",
      headers: { cookie: request.headers.get("cookie") ?? "" },
    });
    const setCookieHeaders = res.headers.getSetCookie?.() ?? [];
    if (!res.ok || setCookieHeaders.length === 0) {
      return { payload: null, setCookieHeaders: [] };
    }

    const accessCookie = setCookieHeaders.find((c) => c.startsWith("biconic_access="));
    if (!accessCookie) {
      return { payload: null, setCookieHeaders };
    }

    const token = accessCookie.split(";")[0].slice("biconic_access=".length);
    const payload = await verifyAccessToken(token);
    return { payload, setCookieHeaders };
  } catch {
    return { payload: null, setCookieHeaders: [] };
  }
}

function withRefreshedCookies(
  response: NextResponse,
  setCookieHeaders: string[]
): NextResponse {
  for (const cookie of setCookieHeaders) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

export async function updateJwtSession(request: NextRequest) {
  let setCookieHeaders: string[] = [];

  const accessToken = request.cookies.get("biconic_access")?.value;
  let payload = accessToken ? await verifyAccessToken(accessToken) : null;

  if (!payload?.sub) {
    const refreshed = await tryRefreshSession(request);
    payload = refreshed.payload;
    setCookieHeaders = refreshed.setCookieHeaders;
  }

  const userId = payload?.sub;
  const role = payload?.app_role ?? null;

  const getHomeForRole = (r?: string | null) => {
    switch (r) {
      case "APP_ADMIN":
        return "/admin";
      case "VIEWER":
        return "/viewer";
      default:
        return "/dashboard";
    }
  };

  if (
    userId &&
    (request.nextUrl.pathname === "/auth/login" ||
      request.nextUrl.pathname.startsWith("/auth/login/"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = getHomeForRole(role);
    return withRefreshedCookies(NextResponse.redirect(url), setCookieHeaders);
  }

  if (userId && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = getHomeForRole(role);
    return withRefreshedCookies(NextResponse.redirect(url), setCookieHeaders);
  }

  if (
    userId &&
    role === "APP_ADMIN" &&
    !request.nextUrl.pathname.startsWith("/admin") &&
    !request.nextUrl.pathname.startsWith("/api") &&
    request.nextUrl.pathname !== "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return withRefreshedCookies(NextResponse.redirect(url), setCookieHeaders);
  }

  if (
    userId &&
    role === "VIEWER" &&
    !request.nextUrl.pathname.startsWith("/viewer") &&
    !request.nextUrl.pathname.startsWith("/api") &&
    request.nextUrl.pathname !== "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/viewer";
    return withRefreshedCookies(NextResponse.redirect(url), setCookieHeaders);
  }

  if (
    userId &&
    request.nextUrl.pathname.startsWith("/viewer") &&
    role !== "VIEWER" &&
    !request.nextUrl.pathname.startsWith("/api")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = getHomeForRole(role);
    return withRefreshedCookies(NextResponse.redirect(url), setCookieHeaders);
  }

  if (
    userId &&
    request.nextUrl.pathname.startsWith("/admin") &&
    role !== "APP_ADMIN" &&
    !request.nextUrl.pathname.startsWith("/api")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = getHomeForRole(role);
    return withRefreshedCookies(NextResponse.redirect(url), setCookieHeaders);
  }

  if (
    request.nextUrl.pathname !== "/" &&
    !userId &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/api") &&
    !request.nextUrl.pathname.startsWith("/public")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  return withRefreshedCookies(NextResponse.next({ request }), setCookieHeaders);
}
