/**
 * Elimina los datos de demo creados por seed-demo-platform.ts.
 *
 * Uso:
 *   npm run clear:demo-platform
 */
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://localhost:5432/biconic";

const DEMO_SLUGS = [
  "acme-retail",
  "nova-logistics",
  "helix-health",
  "orion-finance",
];

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1 });

  const clients = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM public.clients WHERE slug = ANY(${DEMO_SLUGS})
  `;

  if (clients.length === 0) {
    console.log("No hay clientes de demo para eliminar.");
    await sql.end();
    return;
  }

  const ids = clients.map((c) => c.id);
  const [dashCount] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM public.dashboard WHERE client_id = ANY(${ids})
  `;
  const [etlCount] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM public.etl WHERE client_id = ANY(${ids})
  `;

  await sql`DELETE FROM public.clients WHERE id = ANY(${ids})`;

  console.log("Datos de demo eliminados:");
  console.log(`  Clientes:   ${clients.length}`);
  console.log(`  Dashboards: ${dashCount?.count ?? 0} (cascade)`);
  console.log(`  ETLs:       ${etlCount?.count ?? 0} (cascade)`);
  console.log("\nRecargá /admin/dashboard para ver la lista actualizada.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
