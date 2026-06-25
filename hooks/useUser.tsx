"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { backendClient } from "@/lib/api/backend-client";

type Profile = Tables<"profiles"> | null;
type AppRole = Database["public"]["Enums"]["app_role"];

type AuthUser = {
  id: string;
  email?: string;
};

type UserContextValue = {
  user: AuthUser | null;
  profile: Profile;
  role: AppRole | null;
  isLoading: boolean;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setIsLoading(true);
        const me = await backendClient.auth.me();
        if (!mounted) return;
        setUser({ id: me.id, email: me.email ?? undefined });
        setProfile({
          id: me.id,
          email: me.email,
          full_name: me.full_name ?? null,
          app_role: me.app_role,
        } as Profile);
        setRole(me.app_role as AppRole);
      } catch {
        if (mounted) {
          setUser(null);
          setProfile(null);
          setRole(null);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(
    () => ({ user, profile, role, isLoading }),
    [user, profile, role, isLoading]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return ctx;
}
