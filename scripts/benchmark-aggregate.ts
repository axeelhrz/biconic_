/**
 * Benchmark: Supabase/Next route vs backend propio con la misma query.
 * Uso: pnpm tsx scripts/benchmark-aggregate.ts
 */
const payload = {
  tableName: process.env.BENCH_TABLE ?? "etl_output.dw_facturacion",
  dimensions: ["store_city"],
  metrics: [{ field: "facturaci_n", func: "SUM", alias: "total" }],
  limit: 100,
};

async function timed(label: string, fn: () => Promise<void>) {
  const start = performance.now();
  await fn();
  const ms = Math.round(performance.now() - start);
  console.log(`${label}: ${ms}ms`);
  return ms;
}

async function main() {
  const nextUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

  console.log("Payload:", JSON.stringify(payload, null, 2));
  console.log("---");

  await timed("Next.js /api/dashboard/aggregate-data", async () => {
    const res = await fetch(`${nextUrl}/api/dashboard/aggregate-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: process.env.BENCH_COOKIE ?? "" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    await res.json();
  });

  await timed("Backend /v1/dashboard/aggregate-data", async () => {
    const res = await fetch(`${backendUrl}/dashboard/aggregate-data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: process.env.BENCH_COOKIE ?? "",
        authorization: process.env.BENCH_BEARER ? `Bearer ${process.env.BENCH_BEARER}` : "",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    await res.json();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
