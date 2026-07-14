import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
import { formatNextExecutionDisplay, parseScheduleFromLayout } from "@/lib/etl/schedule";

function getSql() {
  return postgres(getInternalDbUrl(), { max: 5 });
}

async function requireAppAdmin() {
  const user = await getServerAuthUser();
  if (!user?.id) throw new Error("No autorizado");
  if (user.app_role !== "APP_ADMIN") {
    const sql = getSql();
    try {
      const [profile] = await sql<{ app_role: string }[]>`
        SELECT app_role FROM public.profiles WHERE id = ${user.id} LIMIT 1
      `;
      if (profile?.app_role !== "APP_ADMIN") throw new Error("Solo administradores");
    } finally {
      await sql.end();
    }
  }
  return user;
}

let cachedClientNameCol: "company_name" | "name" | null = null;

async function getClientNameColumn(sql: ReturnType<typeof postgres>): Promise<"company_name" | "name"> {
  if (cachedClientNameCol) return cachedClientNameCol;
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients'
      AND column_name IN ('company_name', 'name')
  `;
  const names = new Set(cols.map((c) => c.column_name));
  cachedClientNameCol = names.has("company_name") ? "company_name" : "name";
  return cachedClientNameCol;
}

export async function getEtlsAdminFromDb(options?: { clientId?: string | null }) {
  await requireAppAdmin();
  const sql = getSql();
  const clientId = options?.clientId?.trim() || null;

  try {
    const rows = clientId
      ? await sql<Record<string, unknown>[]>`
          SELECT * FROM public.etl
          WHERE client_id = ${clientId}
          ORDER BY created_at DESC
        `
      : await sql<Record<string, unknown>[]>`
          SELECT * FROM public.etl ORDER BY created_at DESC
        `;

    const ownerIds = Array.from(
      new Set(rows.map((r) => r.user_id).filter((id): id is string => typeof id === "string"))
    );
    const clientIds = Array.from(
      new Set(rows.map((r) => r.client_id).filter((id): id is string => typeof id === "string"))
    );

    const owners: Record<string, string | null> = {};
    if (ownerIds.length > 0) {
      const profiles = await sql<{ id: string; full_name: string | null }[]>`
        SELECT id, full_name FROM public.profiles WHERE id = ANY(${ownerIds})
      `;
      for (const p of profiles) owners[p.id] = p.full_name;
    }

    const clients: Record<string, string | null> = {};
    if (clientIds.length > 0) {
      const nameCol = await getClientNameColumn(sql);
      const clientRows = await sql.unsafe<{ id: string; label: string | null }[]>(
        `
        SELECT id::text AS id, ${nameCol} AS label
        FROM public.clients WHERE id = ANY($1::uuid[])
        `,
        [clientIds]
      );
      for (const c of clientRows) clients[c.id] = c.label;
    }

    const etlIds = rows.map((r) => String(r.id));
    const lastRunByEtlId: Record<string, string> = {};
    if (etlIds.length > 0) {
      const runs = await sql<
        { etl_id: string | null; completed_at: string | null; started_at: string }[]
      >`
        SELECT DISTINCT ON (etl_id) etl_id, completed_at, started_at
        FROM public.etl_runs_log
        WHERE etl_id = ANY(${etlIds}::uuid[])
        ORDER BY etl_id, started_at DESC
      `;
      for (const run of runs) {
        if (run.etl_id) {
          lastRunByEtlId[run.etl_id] = run.completed_at ?? run.started_at;
        }
      }
    }

    const enrichedRows = rows.map((r) => {
      const schedule = parseScheduleFromLayout(r.layout);
      const frequency = schedule?.frequency?.trim() || null;
      const id = String(r.id);
      return {
        ...r,
        lastExecution: lastRunByEtlId[id] ?? null,
        nextExecution: formatNextExecutionDisplay(schedule?.lastRunAt, frequency, schedule ?? undefined),
        createdAt: r.created_at ?? null,
      };
    });

    return { ok: true as const, data: enrichedRows, owners, clients, error: null };
  } finally {
    await sql.end();
  }
}

export async function getClientsListFromDb() {
  await requireAppAdmin();
  const sql = getSql();
  try {
    const nameCol = await getClientNameColumn(sql);
    return await sql.unsafe<{ id: string; name: string }[]>(
      `
      SELECT id::text AS id,
        COALESCE(NULLIF(TRIM(${nameCol}), ''), 'Sin nombre') AS name
      FROM public.clients
      ORDER BY ${nameCol} ASC
      LIMIT 500
      `
    );
  } finally {
    await sql.end();
  }
}

export async function createEtlFromDb(clientId: string, title: string, userId: string) {
  await requireAppAdmin();
  const sql = getSql();
  try {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO public.etl (client_id, user_id, name, title, status, published, layout)
      VALUES (
        ${clientId},
        ${userId},
        ${title},
        ${title},
        'Borrador',
        false,
        ${{ widgets: [], zoom: 1, grid: 20, edges: [] } as any}
      )
      RETURNING id
    `;
    if (!row) throw new Error("No se pudo crear el ETL");
    return { ok: true as const, etlId: row.id };
  } finally {
    await sql.end();
  }
}

export async function updateEtlFromDb(
  etlId: string,
  payload: { title?: string; status?: string; published?: boolean }
) {
  await requireAppAdmin();
  const sql = getSql();
  try {
    if (payload.title != null) {
      await sql`
        UPDATE public.etl SET title = ${payload.title}, name = ${payload.title}
        WHERE id = ${etlId}
      `;
    }
    if (payload.status != null) {
      await sql`UPDATE public.etl SET status = ${payload.status} WHERE id = ${etlId}`;
    }
    if (payload.published != null) {
      await sql`UPDATE public.etl SET published = ${payload.published} WHERE id = ${etlId}`;
    }
    return { ok: true as const };
  } finally {
    await sql.end();
  }
}

export async function deleteEtlFromDb(etlId: string) {
  await requireAppAdmin();
  const sql = getSql();
  try {
    const [etl] = await sql<{ output_table: string | null; layout: unknown }[]>`
      SELECT output_table, layout FROM public.etl WHERE id = ${etlId} LIMIT 1
    `;
    if (!etl) throw new Error("ETL no encontrado");

    let targetTableName: string | undefined;
    if (etl.output_table) {
      targetTableName = etl.output_table;
    } else {
      const layout = etl.layout as {
        widgets?: { type?: string; end?: { target?: { table?: string } } }[];
      } | null;
      const widgets = Array.isArray(layout?.widgets) ? layout.widgets : [];
      const endNode = widgets.find((w) => w.type === "end");
      targetTableName = endNode?.end?.target?.table;
    }

    if (targetTableName) {
      const safeName = targetTableName.replace(/^etl_output\./, "").replace(/[^a-zA-Z0-9_]/g, "");
      if (safeName) {
        await sql.unsafe(`DROP TABLE IF EXISTS etl_output."${safeName}"`);
      }
    }

    const deleted = await sql<{ id: string }[]>`
      DELETE FROM public.etl WHERE id = ${etlId} RETURNING id
    `;
    if (!deleted[0]) throw new Error("ETL no encontrado");
    return { ok: true as const };
  } finally {
    await sql.end();
  }
}

export async function getEtlForPreviewFromDb(etlId: string) {
  await requireAppAdmin();
  const sql = getSql();
  try {
    const [row] = await sql<
      {
        id: string;
        title: string | null;
        name: string;
        status: string;
        published: boolean;
        created_at: string;
        output_table: string | null;
        user_id: string | null;
        client_id: string | null;
        layout: { guided_config?: unknown } | null;
      }[]
    >`
      SELECT id, title, name, status, published, created_at, output_table, user_id, client_id, layout
      FROM public.etl WHERE id = ${etlId} LIMIT 1
    `;
    if (!row) return { ok: false as const, error: "ETL no encontrado", data: null };

    let ownerName: string | null = null;
    if (row.user_id) {
      const [profile] = await sql<{ full_name: string | null }[]>`
        SELECT full_name FROM public.profiles WHERE id = ${row.user_id} LIMIT 1
      `;
      ownerName = profile?.full_name ?? null;
    }

    let clientName: string | null = null;
    if (row.client_id) {
      const nameCol = await getClientNameColumn(sql);
      const [client] = await sql.unsafe<{ label: string | null }[]>(
        `SELECT ${nameCol} AS label FROM public.clients WHERE id = $1 LIMIT 1`,
        [row.client_id]
      );
      clientName = client?.label?.trim() || null;
    }

    const guidedConfig =
      row.layout?.guided_config && typeof row.layout.guided_config === "object"
        ? (row.layout.guided_config as Record<string, unknown>)
        : null;

    return {
      ok: true as const,
      data: {
        id: row.id,
        title: row.title ?? row.name ?? "Sin título",
        name: row.name,
        description: "",
        status: row.status ?? "Borrador",
        published: row.published ?? false,
        created_at: row.created_at,
        output_table: row.output_table ?? undefined,
        ownerName,
        clientName,
        guidedConfig,
      },
      error: null,
    };
  } finally {
    await sql.end();
  }
}

export async function getAdminEtlPageDataFromDb(etlId: string): Promise<{
  title: string;
  clientId: string | null;
  initialGuidedConfig: Record<string, unknown> | null;
  initialWidgets: unknown[] | null;
  initialZoom?: number;
  initialGrid?: number;
  initialEdges?: Array<{ id: string; from: string; to: string }>;
} | null> {
  await requireAppAdmin();
  const sql = getSql();
  try {
    const [row] = await sql<
      {
        id: string;
        name: string;
        title: string | null;
        client_id: string | null;
        layout: Record<string, unknown> | null;
      }[]
    >`
      SELECT id, name, title, client_id, layout
      FROM public.etl
      WHERE id = ${etlId}
      LIMIT 1
    `;
    if (!row) return null;

    const layout = row.layout ?? {};
    let initialGuidedConfig: Record<string, unknown> | null = null;
    let initialWidgets: unknown[] | null = null;
    let initialZoom: number | undefined;
    let initialGrid: number | undefined;
    let initialEdges: Array<{ id: string; from: string; to: string }> | undefined;

    if (layout && typeof layout === "object") {
      if (Array.isArray((layout as { widgets?: unknown }).widgets)) {
        initialWidgets = (layout as { widgets: unknown[] }).widgets;
      }
      if (typeof (layout as { zoom?: unknown }).zoom === "number") {
        initialZoom = (layout as { zoom: number }).zoom;
      }
      if (typeof (layout as { grid?: unknown }).grid === "number") {
        initialGrid = (layout as { grid: number }).grid;
      }
      if (Array.isArray((layout as { edges?: unknown }).edges)) {
        initialEdges = (layout as { edges: Array<{ id: string; from: string; to: string }> }).edges;
      }
      const guided = (layout as { guided_config?: unknown }).guided_config;
      if (guided && typeof guided === "object") {
        initialGuidedConfig = guided as Record<string, unknown>;
      }
    }

    return {
      title: row.title ?? row.name ?? etlId,
      clientId: row.client_id,
      initialGuidedConfig,
      initialWidgets,
      initialZoom,
      initialGrid,
      initialEdges,
    };
  } finally {
    await sql.end();
  }
}
