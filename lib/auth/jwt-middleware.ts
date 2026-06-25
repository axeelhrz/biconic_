import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
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

export async function updateJwtSession(request: NextRequest) {
  const response = NextResponse.next({ request });
  const accessToken = request.cookies.get("biconic_access")?.value;
  const payload = accessToken ? await verifyAccessToken(accessToken) : null;
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
    return NextResponse.redirect(url);
  }

  if (userId && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = getHomeForRole(role);
    return NextResponse.redirect(url);
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
    return NextResponse.redirect(url);
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
    return NextResponse.redirect(url);
  }

  if (
    userId &&
    request.nextUrl.pathname.startsWith("/viewer") &&
    role !== "VIEWER" &&
    !request.nextUrl.pathname.startsWith("/api")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = getHomeForRole(role);
    return NextResponse.redirect(url);
  }

  if (
    userId &&
    request.nextUrl.pathname.startsWith("/admin") &&
    role !== "APP_ADMIN" &&
    !request.nextUrl.pathname.startsWith("/api")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = getHomeForRole(role);
    return NextResponse.redirect(url);
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

  return response;
}
