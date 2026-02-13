import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.replace(/^['"]|['"]$/g, "").trim();
}

function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ?? "";
  return key.replace(/^['"]|['"]$/g, "").trim();
}

export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
}
