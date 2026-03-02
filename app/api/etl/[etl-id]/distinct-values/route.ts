import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

async function resolveEtlTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  etlId: string
): Promise<{ schema: string; tableName: string } | null> {
  const { data: latestRun } = await supabase
    .from("etl_runs_log")
    .select("destination_schema,destination_table_name")
    .eq("etl_id", etlId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestRun?.destination_table_name) {
    return {
      schema: latestRun.destination_schema || "etl_output",
      tableName: latestRun.destination_table_name,
    };
  }

  const { data: etlRow } = await supabase
    .from("etl")
    .select("layout, output_table")
    .eq("id", etlId)
    .maybeSingle();

  if (!etlRow) return null;

  const outputTable = (etlRow as { output_table?: string | null }).output_table;
  if (typeof outputTable === "string" && outputTable.trim()) {
    const tableName = outputTable.trim().replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    for (const schemaName of ["etl_output", "public"]) {
      const schemaClient = supabase.schema(schemaName as "public" | "etl_output") as any;
      const { error } = await schemaClient.from(tableName).select("*").limit(1);
      if (!error) return { schema: schemaName, tableName };
    }
  }

  const layout = (etlRow as { layout?: Record<string, unknown> }).layout;
  // guided_config (flujo guiado)
  const guided = layout?.guided_config && typeof layout.guided_config === "object" ? layout.guided_config as Record<string, unknown> : undefined;
  const end = guided?.end && typeof guided.end === "object" ? guided.end as Record<string, unknown> : undefined;
  const target = end?.target && typeof end.target === "object" ? end.target as Record<string, unknown> : undefined;
  let rawTable = target?.table;
  if (typeof rawTable === "string" && rawTable.trim()) {
    const tableName = rawTable.trim().replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    for (const schemaName of ["etl_output", "public"]) {
      const schemaClient = supabase.schema(schemaName as "public" | "etl_output") as any;
      const { error } = await schemaClient.from(tableName).select("*").limit(1);
      if (!error) return { schema: schemaName, tableName };
    }
  }
  // layout.widgets (editor por nodos, incl. ETLs con JOIN)
  const widgets = layout?.widgets;
  if (Array.isArray(widgets)) {
    const endWidget = widgets.find((w: { type?: string }) => w?.type === "end");
    if (endWidget && typeof endWidget === "object") {
      const endObj = (endWidget as { end?: { target?: { table?: string } } }).end;
      rawTable = endObj?.target?.table;
      if (typeof rawTable === "string" && rawTable.trim()) {
        const tableName = rawTable.trim().replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        for (const schemaName of ["etl_output", "public"]) {
          const schemaClient = supabase.schema(schemaName as "public" | "etl_output") as any;
          const { error } = await schemaClient.from(tableName).select("*").limit(1);
          if (!error) return { schema: schemaName, tableName };
        }
      }
    }
  }
  return null;
}

const MAX_ROWS = 5000;

/**
 * GET /api/etl/[etl-id]/distinct-values?column=COLUMN_NAME
 * Devuelve valores distintos de una columna de la tabla de destino del ETL (para métricas / filtros).
 * Requiere APP_ADMIN.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "etl-id": string }> }
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("app_role")
      .eq("id", user.id)
      .single();
    if ((profile as { app_role?: string })?.app_role !== "APP_ADMIN") {
      return NextResponse.json({ ok: false, error: "Requiere rol de administrador" }, { status: 403 });
    }

    const awaitedParams = await params;
    const etlId = awaitedParams["etl-id"];
    if (!etlId) {
      return NextResponse.json({ ok: false, error: "etl-id requerido" }, { status: 400 });
    }

    const url = new URL(request.url);
    const columnParam = (url.searchParams.get("column") ?? "").trim();
    // Quitar prefijo tipo "schema." o "tablename." si vino calificado
    const columnRaw = columnParam.replace(/^[a-zA-Z0-9_]+\./, "").replace(/[^a-zA-Z0-9_]/g, "");
    if (!columnRaw) {
      return NextResponse.json({ ok: false, error: "Parámetro column requerido" }, { status: 400 });
    }
    // En PostgreSQL los identificadores sin comillas son en minúsculas; PostgREST usa el nombre tal cual
    const column = columnRaw.toLowerCase();

    const resolved = await resolveEtlTable(supabase, etlId);
    if (!resolved) {
      return NextResponse.json({ ok: false, error: "No se encontró tabla de destino para este ETL" }, { status: 404 });
    }

    // Las tablas de destino del ETL (ej. etl_output.otraprueba) suelen no tener permisos para el rol anónimo/authenticated.
    // Usamos siempre el service role para leerlas y así evitar "permission denied".
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Servidor sin SUPABASE_SERVICE_ROLE_KEY. Configurá la variable para leer tablas del ETL." },
        { status: 503 }
      );
    }
    const schemaClient = createServiceRoleClient().schema(resolved.schema as "public" | "etl_output") as any;
    const { data: rows, error } = await schemaClient
      .from(resolved.tableName)
      .select(column)
      .limit(MAX_ROWS);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const raw = (rows ?? []) as Record<string, unknown>[];
    const values = [...new Set(raw.map((r) => r[column]).filter((v) => v != null && v !== "").map((v) => String(v)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return NextResponse.json({
      ok: true,
      values,
      count: values.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al obtener valores";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
