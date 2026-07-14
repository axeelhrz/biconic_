"use client";

import { createClient } from "@/lib/supabase/client";
import { backendClient, isOwnBackendEnabled } from "@/lib/api/backend-client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    if (isOwnBackendEnabled()) {
      await backendClient.auth.logout();
    } else {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push("/auth/login");
    router.refresh();
  };

  return <Button onClick={logout}>Logout</Button>;
}
