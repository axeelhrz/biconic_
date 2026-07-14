/**
 * Crea o actualiza el usuario admin de desarrollo local (APP_ADMIN).
 *
 * Uso:
 *   pnpm tsx scripts/seed-dev-admin.ts
 *
 * Variables opcionales:
 *   DATABASE_URL (default: postgres://localhost:5432/biconic)
 *   DEV_ADMIN_EMAIL (default: admin@biconic.local)
 *   DEV_ADMIN_PASSWORD (default: Admin123!)
 *   DEV_ADMIN_NAME (default: Admin Local)
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import postgres from "postgres";

const require = createRequire(import.meta.url);
const bcrypt = require(join(process.cwd(), "backend/node_modules/bcryptjs")) as {
  hash: (password: string, rounds: number) => Promise<string>;
};

const EMAIL = process.env.DEV_ADMIN_EMAIL ?? "admin@biconic.local";
const PASSWORD = process.env.DEV_ADMIN_PASSWORD ?? "Admin123!";
const FULL_NAME = process.env.DEV_ADMIN_NAME ?? "Admin Local";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://localhost:5432/biconic";

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1 });
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const existing = await sql<{ id: string }[]>`
    SELECT id FROM public.profiles WHERE lower(email) = lower(${EMAIL}) LIMIT 1
  `;

  const rows =
    existing.length > 0
      ? await sql<{ id: string; email: string; app_role: string }[]>`
          UPDATE public.profiles
          SET full_name = ${FULL_NAME},
              password_hash = ${passwordHash},
              app_role = 'APP_ADMIN'
          WHERE id = ${existing[0].id}
          RETURNING id, email, app_role
        `
      : await sql<{ id: string; email: string; app_role: string }[]>`
          INSERT INTO public.profiles (id, email, full_name, password_hash, app_role)
          VALUES (gen_random_uuid(), ${EMAIL}, ${FULL_NAME}, ${passwordHash}, 'APP_ADMIN')
          RETURNING id, email, app_role
        `;

  const user = rows[0];
  if (!user) {
    throw new Error("No se pudo crear o actualizar el usuario admin");
  }

  console.log("Usuario admin de desarrollo listo:");
  console.log(`  email:    ${user.email}`);
  console.log(`  password: ${PASSWORD}`);
  console.log(`  app_role: ${user.app_role}`);
  console.log(`  id:       ${user.id}`);
  console.log("\nCierra sesión y vuelve a entrar para obtener un JWT con APP_ADMIN.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
