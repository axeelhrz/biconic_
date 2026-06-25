/**
 * Inserta datos de demo (clientes, conexiones, ETLs, dashboards) para el panel /admin.
 *
 * Uso:
 *   pnpm tsx scripts/seed-demo-platform.ts
 *
 * Requiere antes: pnpm seed:dev-admin
 */
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://localhost:5432/biconic";

const DEMO_CLIENTS = [
  { name: "Acme Retail", slug: "acme-retail" },
  { name: "Nova Logistics", slug: "nova-logistics" },
  { name: "Helix Health", slug: "helix-health" },
  { name: "Orion Finance", slug: "orion-finance" },
];

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1 });

  const [admin] = await sql<{ id: string }[]>`
    SELECT id FROM public.profiles WHERE app_role = 'APP_ADMIN' ORDER BY created_at ASC LIMIT 1
  `;
  if (!admin) {
    throw new Error("No hay usuario APP_ADMIN. Ejecutá primero: pnpm seed:dev-admin");
  }

  const existing = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM public.clients
  `;
  if (Number(existing[0]?.count) > 0) {
    console.log("Ya hay clientes en la base. Omitiendo seed de demo.");
    await sql.end();
    return;
  }

  let planId: string | undefined;
  const [existingPlan] = await sql<{ id: string }[]>`
    SELECT id FROM public.plans WHERE name = 'Starter' LIMIT 1
  `;
  if (existingPlan) {
    planId = existingPlan.id;
  } else {
    const [starterPlan] = await sql<{ id: string }[]>`
      INSERT INTO public.plans (name, price_monthly, price_yearly)
      VALUES ('Starter', 49, 490)
      RETURNING id
    `;
    planId = starterPlan?.id;
  }

  let dashboardTotal = 0;
  let etlTotal = 0;
  let connectionTotal = 0;

  for (const client of DEMO_CLIENTS) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO public.clients (name, slug, type)
      VALUES (${client.name}, ${client.slug}, 'empresa')
      RETURNING id
    `;
    const clientId = row.id;

    await sql`
      INSERT INTO public.client_members (client_id, user_id, role)
      VALUES (${clientId}, ${admin.id}, 'admin')
      ON CONFLICT (client_id, user_id) DO NOTHING
    `;

    if (planId) {
      await sql`
        INSERT INTO public.subscriptions (client_id, plan_id, status, billing_interval)
        VALUES (${clientId}, ${planId}, 'active', 'month')
      `;
    }

    const [connection] = await sql<{ id: string }[]>`
      INSERT INTO public.connections (client_id, user_id, name, type)
      VALUES (${clientId}, ${admin.id}, ${`Conexión ${client.name}`}, 'excel')
      RETURNING id
    `;
    connectionTotal += 1;

    const [etl] = await sql<{ id: string }[]>`
      INSERT INTO public.etl (client_id, connection_id, user_id, name, title, status, published)
      VALUES (
        ${clientId},
        ${connection.id},
        ${admin.id},
        ${`etl-${client.slug}`},
        ${`ETL ${client.name}`},
        'active',
        true
      )
      RETURNING id
    `;
    etlTotal += 1;

    const dashboards = [
      { name: `dash-${client.slug}-1`, title: `Ventas ${client.name}`, published: true },
      { name: `dash-${client.slug}-2`, title: `Operaciones ${client.name}`, published: false },
    ];

    for (const dash of dashboards) {
      await sql`
        INSERT INTO public.dashboard (client_id, user_id, name, title, published)
        VALUES (${clientId}, ${admin.id}, ${dash.name}, ${dash.title}, ${dash.published})
      `;
      dashboardTotal += 1;
    }

    await sql`
      INSERT INTO public.etl (client_id, connection_id, user_id, name, title, status, published)
      VALUES (
        ${clientId},
        ${connection.id},
        ${admin.id},
        ${`etl-${client.slug}-ops`},
        ${`ETL Operaciones ${client.name}`},
        'draft',
        false
      )
    `;
    etlTotal += 1;
  }

  console.log("Datos de demo insertados:");
  console.log(`  Clientes:     ${DEMO_CLIENTS.length}`);
  console.log(`  Dashboards:   ${dashboardTotal}`);
  console.log(`  ETLs:         ${etlTotal}`);
  console.log(`  Conexiones:   ${connectionTotal}`);
  console.log("\nRecargá /admin para ver el resumen con datos reales.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
