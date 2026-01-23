"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Database, Tables } from "@/lib/supabase/database.types";

type Profile = Tables<"profiles"> | null;

type AppRole = Database["public"]["Enums"]["app_role"];

type UserContextValue = {
  user: import("@supabase/supabase-js").User | null;
  profile: Profile;
  role: AppRole | null;
  isLoading: boolean;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [supabase, setSupabase] = useState<ReturnType<typeof import("@/lib/supabase/client").createClient> | null>(null);
  const [user, setUser] = useState<import("@supabase/supabase-js").User | null>(
    null
  );
  const [profile, setProfile] = useState<Profile>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize Supabase client only on client side
  useEffect(() => {
    const initializeSupabase = async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        setSupabase(() => createClient());
      } catch (error) {
        console.error("Failed to initialize Supabase client:", error);
        setIsLoading(false);
      }
    };

    initializeSupabase();
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    async function load() {
      try {
        setIsLoading(true);
        const {
          data: { user },
        } = await supabase!.auth.getUser();
        if (!mounted) return;
        setUser(user ?? null);

        if (user) {
          const { data: prof, error } = await supabase!
            .from("profiles")
            .select("id, email, full_name, job_title, app_role")
            .eq("id", user.id)
            .single();
          if (!mounted) return;
          if (!error && prof) {
            setProfile(prof as Profile);
            setRole((prof as any).app_role ?? null);
          } else {
            setProfile(null);
            setRole(null);
          }
        } else {
          setProfile(null);
          setRole(null);
        }
      } catch (error) {
        console.error("Failed to load user:", error);
        if (mounted) {
          setUser(null);
          setProfile(null);
          setRole(null);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    load();
    const { data: sub } = supabase!.auth.onAuthStateChange(() => {
      load();
    });
    return () => {
      mounted = false;
      sub.subscription?.unsubscribe?.();
    };
  }, [supabase]);

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