// src/hooks/useUserRole.ts
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useUserRole() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function getUserRole() {
      // Primero, obtenemos el usuario de la sesión actual
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && mounted) {
        // Si hay un usuario, consultamos su perfil para obtener el rol
        const { data, error } = await supabase
          .from("profiles")
          .select("app_role")
          .eq("id", user.id)
          .single();

        if (error && error.code !== "PGRST116") {
          // Ignora el error "no rows found"
          console.error("Error fetching user role:", error);
        }

        if (mounted) {
          setRole((data as { app_role?: string } | null)?.app_role ?? null);
        }
      }

      if (mounted) {
        setLoading(false);
      }
    }

    getUserRole();

    return () => {
      mounted = false;
    };
  }, []);

  return { role, loading };
}
