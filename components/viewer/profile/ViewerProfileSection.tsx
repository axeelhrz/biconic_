"use client";
import React, { useEffect, useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";

export default function ViewerProfileSection() {
  const { role } = useUserRole();
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const loadUser = async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        const user = data.user;
        if (user) {
          setEmail(user.email || null);
          const name =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.user_metadata?.username ||
            null;
          setFullName(name);
        }
      } catch (error) {
        console.error("Failed to load user:", error);
        if (mounted) {
          setEmail(null);
          setFullName(null);
        }
      }
    };
    
    loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col box-border w-full max-w-[800px] px-10 py-8 mx-auto bg-[#FDFDFD] border border-[#ECECEC] rounded-[30px] gap-6">
      <h1 className="text-2xl font-semibold">Perfil (Viewer)</h1>
      <p className="text-sm text-[#54565B]">
        Información básica del usuario (sólo lectura).
      </p>
      <div className="flex flex-col gap-2 text-sm">
        <p>
          <span className="font-medium">Email:</span> {email ?? "—"}
        </p>
        <p>
          <span className="font-medium">Nombre:</span> {fullName ?? "—"}
        </p>
        <p>
          <span className="font-medium">Rol:</span> {role ?? "—"}
        </p>
      </div>
    </div>
  );
}