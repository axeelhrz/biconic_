// src/hooks/useUserRole.ts
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { backendClient, isOwnBackendEnabled } from "@/lib/api/backend-client";

function getHomeForRole(role: string | null): string {
  switch (role) {
    case "APP_ADMIN":
      return "/admin";
    case "VIEWER":
      return "/viewer";
    default:
      return "/dashboard";
  }
}

function isViewerShellPath(pathname: string): boolean {
  return pathname === "/viewer" || pathname.startsWith("/viewer/");
}

function isOnWrongShell(role: string, pathname: string): boolean {
  if (role === "APP_ADMIN") {
    return (
      !pathname.startsWith("/admin") &&
      !pathname.startsWith("/api") &&
      pathname !== "/"
    );
  }
  if (role === "VIEWER") {
    return !isViewerShellPath(pathname) && pathname !== "/";
  }
  if (role === "CREATOR") {
    return pathname.startsWith("/admin") || isViewerShellPath(pathname);
  }
  return false;
}

export function useUserRole() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const redirectingRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function getUserRole() {
      try {
        if (isOwnBackendEnabled()) {
          const me = await backendClient.auth.me();
          if (mounted) setRole(me.app_role ?? null);
          return;
        }

        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && mounted) {
          const { data, error } = await supabase
            .from("profiles")
            .select("app_role")
            .eq("id", user.id)
            .single();

          if (error && error.code !== "PGRST116") {
            console.error("Error fetching user role:", error);
          }

          if (mounted) {
            setRole((data as { app_role?: string } | null)?.app_role ?? null);
          }
        }
      } catch (err) {
        console.error("useUserRole:", err);
        if (mounted) setRole(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    getUserRole();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (loading || !role || !pathname || redirectingRef.current) return;
    if (!isOnWrongShell(role, pathname)) return;

    redirectingRef.current = true;
    const home = getHomeForRole(role);

    async function redirectToHome() {
      if (isOwnBackendEnabled()) {
        try {
          await backendClient.auth.refresh();
        } catch {
          // me() may have refreshed cookies; continue with navigation
        }
        window.location.assign(home);
        return;
      }
      window.location.assign(home);
    }

    void redirectToHome();
  }, [role, loading, pathname]);

  return { role, loading };
}
