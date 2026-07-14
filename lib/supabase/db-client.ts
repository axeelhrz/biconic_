/** Cliente de datos de la app (Postgres + JWT, sin Supabase). */
export type AppDbClient = Awaited<
  ReturnType<typeof import("./server").createClient>
>;
