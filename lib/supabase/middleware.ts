import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip middleware check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  const userId = (user as any)?.sub as string | undefined;

  // Helper to decide the home route based on role
  // Decide redirection home based strictly on app_role enum values
  const getHomeForRole = (role?: string | null) => {
    switch (role) {
      case "APP_ADMIN":
        return "/admin";
      case "VIEWER":
        return "/viewer";
      // CREATOR y cualquier otro rol desconocido van al dashboard general
      case "CREATOR":
      default:
        return "/dashboard";
    }
  };

  // Try to load the user's role from profiles when authenticated
  let role: string | null = null;
  if (userId) {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("app_role")
        .eq("id", userId)
        .single();
      if (!error) role = profile?.app_role ?? null;
    } catch {
      // If fetching the role fails, continue with default behavior
    }
  }

  // If the user is already authenticated, prevent access to the login page
  if (
    user &&
    (request.nextUrl.pathname === "/auth/login" ||
      request.nextUrl.pathname.startsWith("/auth/login/"))
  ) {
    const url = request.nextUrl.clone();
    // Redirect authenticated users to their role-specific home
    url.pathname = getHomeForRole(role);
    const redirectResponse = NextResponse.redirect(url);
    // Important: copy over any cookies Supabase asked us to set on this request
    // so the browser doesn't lose session state during the redirect.
    try {
      // Prefer setAll if available
      // @ts-ignore - setAll may not be in older Next types but exists at runtime
      if (typeof redirectResponse.cookies.setAll === "function") {
        // @ts-ignore
        redirectResponse.cookies.setAll(supabaseResponse.cookies.getAll());
      } else {
        // Fallback: loop through cookies
        for (const cookie of supabaseResponse.cookies.getAll()) {
          redirectResponse.cookies.set(cookie);
        }
      }
    } catch {
      // No-op: if copying cookies fails, proceed with redirect anyway
    }
    return redirectResponse;
  }

  // If authenticated and hitting the root, send to their home
  if (user && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = getHomeForRole(role);
    const redirectResponse = NextResponse.redirect(url);
    try {
      // @ts-ignore - setAll may not be in older Next types but exists at runtime
      if (typeof redirectResponse.cookies.setAll === "function") {
        // @ts-ignore
        redirectResponse.cookies.setAll(supabaseResponse.cookies.getAll());
      } else {
        for (const cookie of supabaseResponse.cookies.getAll()) {
          redirectResponse.cookies.set(cookie);
        }
      }
    } catch {}
    return redirectResponse;
  }

  // APP_ADMIN solo debe navegar dentro de /admin o /api
  if (
    user &&
    role === "APP_ADMIN" &&
    !request.nextUrl.pathname.startsWith("/admin") &&
    !request.nextUrl.pathname.startsWith("/api") &&
    request.nextUrl.pathname !== "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    const redirectResponse = NextResponse.redirect(url);
    try {
      // @ts-ignore
      if (typeof redirectResponse.cookies.setAll === "function") {
        // @ts-ignore
        redirectResponse.cookies.setAll(supabaseResponse.cookies.getAll());
      } else {
        for (const cookie of supabaseResponse.cookies.getAll()) {
          redirectResponse.cookies.set(cookie);
        }
      }
    } catch {}
    return redirectResponse;
  }

  // VIEWER solo debe navegar dentro de /viewer (excepto rutas /api)
  if (
    user &&
    role === "VIEWER" &&
    !request.nextUrl.pathname.startsWith("/viewer") &&
    !request.nextUrl.pathname.startsWith("/api") &&
    request.nextUrl.pathname !== "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/viewer";
    const redirectResponse = NextResponse.redirect(url);
    try {
      // @ts-ignore - setAll may not be in older Next types but exists at runtime
      if (typeof redirectResponse.cookies.setAll === "function") {
        // @ts-ignore
        redirectResponse.cookies.setAll(supabaseResponse.cookies.getAll());
      } else {
        for (const cookie of supabaseResponse.cookies.getAll()) {
          redirectResponse.cookies.set(cookie);
        }
      }
    } catch {}
    return redirectResponse;
  }

  // Proteger /viewer para usuarios que no sean VIEWER
  if (
    user &&
    request.nextUrl.pathname.startsWith("/viewer") &&
    role !== "VIEWER"
  ) {
    if (!request.nextUrl.pathname.startsWith("/api")) {
      const url = request.nextUrl.clone();
      url.pathname = getHomeForRole(role);
      const redirectResponse = NextResponse.redirect(url);
      try {
        // @ts-ignore - setAll may not be in older Next types but exists at runtime
        if (typeof redirectResponse.cookies.setAll === "function") {
          // @ts-ignore
          redirectResponse.cookies.setAll(supabaseResponse.cookies.getAll());
        } else {
          for (const cookie of supabaseResponse.cookies.getAll()) {
            redirectResponse.cookies.set(cookie);
          }
        }
      } catch {}
      return redirectResponse;
    }
  }

  // Proteger /admin para usuarios que no sean APP_ADMIN
  if (
    user &&
    request.nextUrl.pathname.startsWith("/admin") &&
    role !== "APP_ADMIN"
  ) {
    if (!request.nextUrl.pathname.startsWith("/api")) {
      const url = request.nextUrl.clone();
      url.pathname = getHomeForRole(role);
      const redirectResponse = NextResponse.redirect(url);
      try {
        // @ts-ignore - setAll may not be in older Next types but exists at runtime
        if (typeof redirectResponse.cookies.setAll === "function") {
          // @ts-ignore
          redirectResponse.cookies.setAll(supabaseResponse.cookies.getAll());
        } else {
          for (const cookie of supabaseResponse.cookies.getAll()) {
            redirectResponse.cookies.set(cookie);
          }
        }
      } catch {}
      return redirectResponse;
    }
  }

  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    const redirectResponse = NextResponse.redirect(url);
    // Copy Supabase cookies to keep session state consistent across redirects
    try {
      // @ts-ignore - setAll may not be in older Next types but exists at runtime
      if (typeof redirectResponse.cookies.setAll === "function") {
        // @ts-ignore
        redirectResponse.cookies.setAll(supabaseResponse.cookies.getAll());
      } else {
        for (const cookie of supabaseResponse.cookies.getAll()) {
          redirectResponse.cookies.set(cookie);
        }
      }
    } catch {
      // Ignore copy errors
    }
    return redirectResponse;
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
