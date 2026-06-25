/**
 * Crea tablas de países/provincias (si faltan) y siembra Argentina + provincias.
 *
 * Uso:
 *   npm run seed:locations
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://localhost:5432/biconic";

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1 });

  const migrationPath = join(process.cwd(), "migrations/002_countries_provinces.sql");
  const migrationSql = readFileSync(migrationPath, "utf8");
  await sql.unsafe(migrationSql);

  const [existing] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM public.countries
  `;
  if (Number(existing?.count) > 0) {
    console.log("Ya hay países en la base. Omitiendo seed de ubicaciones.");
    await sql.end();
    return;
  }

  const [argentina] = await sql<{ id: string }[]>`
    INSERT INTO public.countries (name, iso_code)
    VALUES ('Argentina', 'AR')
    RETURNING id
  `;

  const geoPath = join(process.cwd(), "public/geo/ar-provincias.geojson");
  const geo = JSON.parse(readFileSync(geoPath, "utf8")) as {
    features?: Array<{ properties?: { name?: string } }>;
  };

  const provinces = (geo.features ?? [])
    .map((f) => f.properties?.name?.trim())
    .filter((name): name is string => Boolean(name));

  for (const name of provinces) {
    await sql`
      INSERT INTO public.provinces (country_id, name)
      VALUES (${argentina.id}, ${name})
    `;
  }

  console.log("Ubicaciones de demo insertadas:");
  console.log("  País:      Argentina");
  console.log(`  Provincias: ${provinces.length}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
