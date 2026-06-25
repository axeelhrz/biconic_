/**
 * Migra usuarios desde export JSON de Supabase Auth + profiles.
 * Exportar desde Supabase SQL:
 *   SELECT u.id, u.email, p.full_name, p.app_role::text
 *   FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id;
 *
 * Uso: pnpm tsx scripts/migrate-users-from-supabase.ts ./users-export.json
 */
import { readFileSync } from "fs";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: tsx scripts/migrate-users-from-supabase.ts <users.json>");
    process.exit(1);
  }
  const users = JSON.parse(readFileSync(file, "utf8")) as Array<{
    id: string;
    email: string;
    full_name?: string;
    app_role?: string;
  }>;

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1").replace(
    /\/$/,
    ""
  );
  const secret = process.env.MIGRATION_SECRET ?? process.env.JWT_SECRET ?? "";

  const res = await fetch(`${apiUrl}/auth/migrate-users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, users }),
  });
  const data = await res.json();
  console.log(res.status, data);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
