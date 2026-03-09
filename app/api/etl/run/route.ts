import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { decryptConnectionPassword } from "@/lib/connection-secret";
import { v4 as uuidv4 } from "uuid";
import { Client as PgClient } from "pg";
import postgres from "postgres"; // Used only for DDL and inserts with postgres.js
import {
  quoteIdent,
  quoteQualified,
  buildWhereClausePg,
  buildWhereClausePgStar,
  buildWhereClauseFirebird,
  buildJoinClauseBinary,
  buildDateFilterWhereFragmentPg,
  buildDateFilterWhereFragmentFirebird,
  type DateFilterSpec,
} from "@/lib/sql/helpers";
import {
  applyCleanBatch,
  applyCastConversions,
  applyArithmeticOperations,
  applyConditionRules,
  getValue,
  CastTargetType
} from "@/lib/etl/transformations";
import { ETL_MAX_ROWS_CEILING } from "@/lib/etl/limits";

// ===================================================================
// TIPOS Y DEFINICIONES
// ===================================================================
type FilterCondition = {
  column: string;
  operator:
    | "="
    | "!="
    | ">"
    | ">="
    | "<"
    | "<="
    | "contains"
    | "startsWith"
    | "endsWith"
    | "in"
    | "not in"
    | "is null"
    | "is not null";
  value?: string;
};

type JoinCondition = {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  joinType: "INNER" | "LEFT" | "RIGHT" | "FULL";
};

type RunBody = {
  etlId?: string;
  connectionId?: string;
  filter?: {
    table?: string;
    columns?: string[];
    conditions?: FilterCondition[];
    dateFilter?: DateFilterSpec;
  };
  join?: {
    connectionId: string;
    secondaryConnectionId?: string;
    leftTable: string;
    rightTable: string;
    joinConditions: JoinCondition[];
    leftColumns?: string[];
    rightColumns?: string[];
  };
  union?: {
    left: {
      connectionId: string;
      filter?: { table?: string; columns?: string[]; conditions?: FilterCondition[] };
    };
    right?: {
      connectionId: string;
      filter?: { table?: string; columns?: string[]; conditions?: FilterCondition[] };
    };
    /** Múltiples tablas a apilar (UNION). Si no se envía, se usa right como única tabla derecha. */
    rights?: Array<{
      connectionId: string;
      filter?: { table?: string; columns?: string[]; conditions?: FilterCondition[] };
    }>;
    unionAll?: boolean;
  };
  clean?: {
    transforms: Array<
      | { column: string; op: "trim" | "upper" | "lower" | "cast_number" | "cast_date" }
      | { column: string; op: "replace"; find: string; replaceWith: string }
      | { column: string; op: "replace_value"; find: string; replaceWith: string }
      | { column: string; op: "normalize_nulls"; patterns: string[]; action: "null" | "replace"; replacement?: string }
      | { column: string; op: "normalize_spaces" | "strip_invisible" | "utf8_normalize" }
    >;
    dedupe?: { keyColumns: string[]; keep: "first" | "last" };
  };
  cast?: {
    conversions: Array<{
      column: string;
      targetType:
        | "number"
        | "integer"
        | "decimal"
        | "string"
        | "boolean"
        | "date"
        | "datetime";
      inputFormat?: string | null;
      outputFormat?: string | null;
    }>;
  };
  count?: {
    attribute: string;
    resultColumn?: string;
  };
  arithmetic?: {
    operations: Array<{
      id: string;
      leftOperand: { type: "column" | "constant"; value: string };
      operator: "+" | "-" | "*" | "/" | "%" | "^" | "pct_of" | "pct_off";
      rightOperand: { type: "column" | "constant"; value: string };
      resultColumn: string;
    }>;
  };
  condition?: {
    resultColumn?: string;
    defaultResultValue?: string;
    rules: Array<{
      id: string;
      column?: string;
      operator?: string;
      value?: string | number | boolean;
      outputValue?: string;
      outputColumn?: string;
      leftOperand?: { type: "column" | "constant"; value: string };
      rightOperand?: { type: "column" | "constant"; value: string };
      comparator?: string;
      resultColumn?: string;
      outputType?: "boolean" | "string" | "number";
      thenValue?: string;
      elseValue?: string;
      shouldFilter?: boolean;
    }>;
  };
  pipeline?: Array<{
    type: "clean" | "cast" | "arithmetic" | "condition";
    config: any;
  }>;
  end?: {
    target: { type: "supabase"; table: string };
    mode: "overwrite" | "append" | "replace";
  };
  preview?: boolean;
  /** Si true, la API espera a que el pipeline termine antes de responder (para redirigir a métricas con datos listos). */
  waitForCompletion?: boolean;
};


// ===================================================================
// FUNCIONES AUXILIARES PARA QUERIES Y TIPOS
// ===================================================================

function inferPostgresType(value: any): string {
  if (typeof value === "number") {
    return "NUMERIC";
  }
  if (typeof value === "boolean") return "BOOLEAN";
  if (typeof value === "object" && value !== null) {
    if (value instanceof Date || !isNaN(new Date(value).getTime()))
      return "TIMESTAMP WITH TIME ZONE";
    return "JSONB";
  }
  return "TEXT";
}

function pgCastExpr(columnIdentifier: string, targetType: CastTargetType) {
  const col = columnIdentifier;
  const sanitized = `NULLIF(
    (
      WITH raw AS (
        SELECT regexp_replace(COALESCE(${col}::text,''), '\\s+', '', 'g') AS r
      ), counts AS (
        SELECT r,
        (length(r) - length(replace(r, '.', ''))) AS dot_count,
        (length(r) - length(replace(r, ',', ''))) AS comma_count,
        position('.' in r) AS first_dot_pos,
        position(',' in r) AS first_comma_pos
        FROM raw
      )
      SELECT regexp_replace(
        CASE
          WHEN comma_count = 0 AND dot_count > 1 THEN replace(r, '.', '')
          WHEN dot_count = 0 AND comma_count > 1 THEN replace(r, ',', '')
          WHEN comma_count > 0 AND dot_count > 0 THEN (
            CASE
              WHEN first_comma_pos > first_dot_pos
                THEN replace(replace(r, '.', ''), ',', '.')
              ELSE replace(replace(r, ',', ''), '.', '.')
            END
          )
          WHEN comma_count = 1 AND dot_count = 0 THEN replace(r, ',', '.')
          WHEN dot_count = 1 AND comma_count = 0 THEN r
          ELSE r
        END,
        '[^0-9.\-]', '', 'g'
      ) FROM counts
    ),
    ''
  )`;
  switch (targetType) {
    case "number":
    case "decimal":
      return `CAST(${sanitized} AS NUMERIC)`;
    case "integer":
      return `CAST(${sanitized} AS NUMERIC)::INTEGER`;
    case "string":
      return `CAST(${col} AS TEXT)`;
    case "boolean":
      return `CASE
        WHEN trim(lower(COALESCE(${col}::text, ''))) IN ('true','t','1','yes','y','si','sí') THEN true
        WHEN trim(lower(COALESCE(${col}::text, ''))) IN ('false','f','0','no','n') THEN false
        ELSE NULL
      END`;
    case "date":
      return `CAST(${col} AS DATE)`;
    case "datetime":
      return `CAST(${col} AS TIMESTAMP)`;
    default:
      return col;
  }
}

// ===================================================================
// REINTENTOS (evitar fallos por redes o timeouts transitorios)
// ===================================================================

const ETL_RETRIES = 3;
const ETL_RETRY_DELAY_MS = 2000;
const STALE_RUN_MINUTES = 20;

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; delayMs?: number; label?: string } = {}
): Promise<T> {
  const retries = opts.retries ?? ETL_RETRIES;
  const delayMs = opts.delayMs ?? ETL_RETRY_DELAY_MS;
  const label = opts.label ?? "operation";
  let lastErr: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        console.warn(`[ETL] ${label} intento ${attempt}/${retries} falló, reintento en ${delayMs}ms:`, (e as Error)?.message);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

/** Asegura estado final en etl_runs_log (nunca dejar "started"/"running" colgado). */
async function ensureRunTerminalState(
  supabaseAdmin: any,
  runId: string,
  status: "completed" | "failed",
  payload: { completed_at: string; rows_processed?: number; error_message?: string }
) {
  await withRetry(
    () =>
      supabaseAdmin
        .from("etl_runs_log")
        .update({ status, ...payload })
        .eq("id", runId)
        .throwOnError(),
    { retries: 5, delayMs: 1000, label: "ensureRunTerminalState" }
  );
}

/** Cierra runs previos colgados de un ETL para evitar "En progreso" perpetuo en UI. */
async function markStaleRunsForEtl(
  supabaseAdmin: any,
  etlId: string
): Promise<void> {
  const threshold = new Date(Date.now() - STALE_RUN_MINUTES * 60 * 1000).toISOString();
  const { data: staleRows, error } = await supabaseAdmin
    .from("etl_runs_log")
    .select("id")
    .eq("etl_id", etlId)
    .in("status", ["started", "running"])
    .lt("started_at", threshold);
  if (error || !staleRows?.length) return;
  const ids = staleRows.map((r: { id: string }) => r.id);
  await supabaseAdmin
    .from("etl_runs_log")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message:
        "Ejecución anterior cerrada automáticamente por timeout/interrupción.",
    })
    .in("id", ids)
    .in("status", ["started", "running"]);
}

// ===================================================================
// LÓGICA DE FONDO (BACKGROUND WORKER)
// ===================================================================

/**
 * Executes the entire ETL pipeline asynchronously.
 * Updates the 'etl_runs_log' table with progress and final status.
 * Usa reintentos en conexiones y escrituras; asegura estado final (completed/failed).
 */
async function executeEtlPipeline(
  body: RunBody,
  runId: string,
  supabaseAdmin: any, // Typed as any to avoid conflicts with different client versions
  user: any
) {
  let newTableName = "";
  const completedAt = () => new Date().toISOString();
  let rowsProcessed = 0;
  const pipelineStartedAt = Date.now();
  const PIPELINE_TIMEOUT_MS = 750_000;
  let pipelineTimedOut = false;

  const pipelineTimer = setTimeout(async () => {
    pipelineTimedOut = true;
    console.error(`[Background Run ${runId}] Timeout de seguridad alcanzado (${PIPELINE_TIMEOUT_MS / 1000}s). Marcando como fallido.`);
    try {
      await ensureRunTerminalState(supabaseAdmin, runId, "failed", {
        completed_at: new Date().toISOString(),
        error_message: `Timeout de seguridad (${PIPELINE_TIMEOUT_MS / 1000}s): el ETL tardó demasiado. Filas procesadas: ${rowsProcessed}. Considere reducir el volumen de datos o agregar filtros.`,
        rows_processed: rowsProcessed,
      });
    } catch (_) {}
  }, PIPELINE_TIMEOUT_MS);

  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("Variable de entorno SUPABASE_DB_URL no encontrada.");
  const sqlPersistent = postgres(dbUrl);

  try {
    const regex = new RegExp("[-:.]", "g");
    const timestamp = new Date().toISOString().replace(regex, "").slice(0, 14);
    const generatedTableName = `run_${timestamp}_${runId.substring(0, 8)}`;
    const mode = body.end?.mode || "overwrite";
    const requestedTargetRaw = body.end?.target?.table?.trim();

    if (mode === "overwrite" && requestedTargetRaw) {
      newTableName = requestedTargetRaw.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    } else if (requestedTargetRaw) {
      newTableName = requestedTargetRaw.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    } else {
      newTableName = generatedTableName;
    }

    // --- UPDATE INITIAL LOG WITH DESTINATION ---
    await withRetry(
      () =>
        supabaseAdmin
          .from("etl_runs_log")
          .update({
            destination_schema: "etl_output",
            destination_table_name: newTableName,
            status: "running",
          })
          .eq("id", runId)
          .throwOnError(),
      { label: "update-running" }
    );


    // Preview logic removed from background execution as preview is typically synchronous/short
    // but we can keep it if unified. However, 'POST' usually returns preview immediately.
    // Assuming this background function is ONLY for full execution.
    const isPreview = !!body.preview; 
    const previewRows: Record<string, any>[] = [];
    const PREVIEW_LIMIT = 5000;

    /** Lotes más grandes = menos iteraciones y más throughput; 60k permite ~900k+ filas en 800s. Si hay timeouts en producción, reducir (p. ej. 20000–30000). */
    const pageSize = 60000;
    const INSERT_CHUNK_SIZE_DEFAULT = 15000;
    /** Postgres limita ~65535 parámetros por query. chunkSize * numColumnas debe quedar por debajo. Aumentar INSERT_CHUNK si hay pocas columnas para menos round-trips. */
    const MAX_PARAMS_PER_QUERY = 65000;
    let tableCreated = false;
    /** Columnas de la tabla destino; al insertar solo se usan estas para evitar "column X does not exist". */
    let tableColumnNames: string[] | null = null;

    // Global count state
    const globalCountMap = new Map<string, number>();
    const globalCountOriginalValues = new Map<string, any>();

    // Excluir filas: aplicar en memoria después de UNION/JOIN (no en WHERE)
    const allConditions = body?.filter?.conditions ?? [];
    const sqlConditions = allConditions.filter((c: FilterCondition) => c.operator !== "not in");
    const excludeRowsRules: { column: string; excluded: string[] }[] = allConditions
      .filter((c: FilterCondition) => c.operator === "not in")
      .map((c) => ({
        column: (c.column || "").replace(/^primary\./i, "").replace(/^join_\d+\./i, "").trim(),
        excluded: (c.value ?? "").split(",").map((v) => v.trim()).filter(Boolean),
      }));
    const dateFilter = body?.filter?.dateFilter ?? undefined;

    /** Quita el byte nulo (0x00) de strings; convierte undefined a null (postgres no admite undefined).
     * Strings que parecen fecha (Date.toString(), ISO, o parseables por Date) se normalizan a ISO
     * para que Postgres acepte DATE/TIMESTAMP sin "Conversion error from string". */
    const _jsDateRe = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s|GMT|UTC|Coordinated|Greenwich/;
    const sanitizeForPostgres = (val: unknown): unknown => {
      if (val === undefined || val === null) return null;
      if (typeof val === "string") {
        const s = val.indexOf("\u0000") >= 0 ? val.replace(/\u0000/g, "") : val;
        if (_jsDateRe.test(s)) {
          const d = new Date(s);
          if (!isNaN(d.getTime())) return d.toISOString();
        }
        return s;
      }
      if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
      if (Buffer.isBuffer(val)) return val.toString("utf8").replace(/\u0000/g, "");
      return val;
    };

    /** Normaliza nombre de columna a identificador válido para tabla (mismo criterio que en inserts). */
    const toSaneKey = (key: string) => key.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

    const insertBatch = async (batch: Record<string, any>[]) => {
      if (batch.length === 0) return;

      if (!tableCreated && !isPreview) {
        const firstRow = batch[0];
        const columnsDefinition: Record<string, string> = {};

        // Map explicit cast target types (by column name; may be "col" or "primary.col")
        const castTypeOverrides: Record<string, string> = {};
        if (body!.cast?.conversions?.length) {
          const allKeys = batch.some((r) => r && typeof r === "object")
            ? Array.from(new Set(batch.flatMap((r) => Object.keys(r))))
            : firstRow ? Object.keys(firstRow) : [];
          const resolveTargets = (simple: string) => {
            const sane = toSaneKey(simple);
            const matches = allKeys.filter(
              (k) => toSaneKey(k) === sane || k === simple || k.endsWith(`_${simple}`)
            );
            return matches.length ? matches : allKeys.includes(simple) ? [simple] : [];
          };
          for (const cv of body!.cast!.conversions) {
            let pgType: string = "TEXT";
            switch (cv.targetType) {
              case "number":
              case "decimal":
                pgType = "NUMERIC";
                break;
              case "integer":
                pgType = "INTEGER";
                break;
              case "string":
                pgType = "TEXT";
                break;
              case "boolean":
                pgType = "BOOLEAN";
                break;
              case "date":
                pgType = "DATE";
                break;
              case "datetime":
                pgType = "TIMESTAMP";
                break;
              default:
                pgType = "TEXT";
            }
            const targets = resolveTargets(cv.column);
            for (const key of targets) {
              castTypeOverrides[toSaneKey(key)] = pgType;
            }
          }
        }

        // Base schema: from body.filter.columns when present (so all selected columns exist even if first row has nulls)
        const filterColumns = body!.filter?.columns as string[] | undefined;
        const explicitColumnNames: string[] =
          filterColumns && filterColumns.length > 0
            ? filterColumns.map((c) => toSaneKey(c))
            : firstRow
            ? Object.keys(firstRow).map((k) => toSaneKey(k))
            : [];

        const seen = new Set<string>();
        for (const colName of explicitColumnNames) {
          if (!colName || seen.has(colName)) continue;
          seen.add(colName);
          const overrideType = castTypeOverrides[colName];
          if (overrideType) {
            columnsDefinition[`"${colName}"`] = overrideType;
            continue;
          }
          // Infer type from first batch: find any row key that normalizes to colName
          let inferred: string = "TEXT";
          for (const row of batch) {
            if (!row || typeof row !== "object") continue;
            for (const key in row) {
              if (toSaneKey(key) === colName) {
                inferred = inferPostgresType(row[key]);
                break;
              }
            }
            if (inferred !== "TEXT") break;
          }
          columnsDefinition[`"${colName}"`] = inferred;
        }

        // When not using filter.columns, preserve any extra keys from first row (e.g. from SELECT *)
        if (!filterColumns?.length && firstRow) {
          for (const key in firstRow) {
            const saneKey = toSaneKey(key);
            if (seen.has(saneKey)) continue;
            seen.add(saneKey);
            const overrideType = castTypeOverrides[saneKey];
            columnsDefinition[`"${saneKey}"`] = overrideType || inferPostgresType(firstRow[key]);
          }
        }

        if (body!.etlId) {
          columnsDefinition['"etl_id"'] = "UUID";
        }

        const columnParts = Object.entries(columnsDefinition).map(
          ([name, type]) => {
            if (
              !name.match(/^"[a-zA-Z0-9_]+"$/) ||
              !type.match(/^[a-zA-Z0-9_ ]+$/)
            ) {
              throw new Error(`Nombre de columna o tipo inválido: ${name} ${type}`);
            }
            return `${name} ${type}`;
          }
        );

        console.log(
          `[Background] Preparando tabla destino (modo=${mode}): etl_output.${newTableName}`
        );

        if (mode === "overwrite" || mode === "replace") {
          const dropQuery = `DROP TABLE IF EXISTS etl_output."${newTableName}" CASCADE;`;
          await sqlPersistent.unsafe(dropQuery);
        }
        if (mode === "append") {
          const existsRes = await sqlPersistent.unsafe(
            `SELECT to_regclass('etl_output."${newTableName}"') AS reg`
          );
          const exists = Array.isArray(existsRes) && existsRes[0]?.reg;
          if (exists) {
            tableCreated = true;
          }
        }
        if (!tableCreated) {
          const createTableQuery = `CREATE TABLE etl_output."${newTableName}" (${columnParts.join(", ")});`;
          await sqlPersistent.unsafe(createTableQuery);
          tableCreated = true;
          tableColumnNames = Object.keys(columnsDefinition).map((k) => k.replace(/^"|"$/g, ""));
        }
        if (mode === "append" && tableCreated && !tableColumnNames) {
          const colsRes = await sqlPersistent.unsafe(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'etl_output' AND table_name = $1 ORDER BY ordinal_position`,
            [newTableName]
          );
          tableColumnNames = Array.isArray(colsRes) ? colsRes.map((r) => String((r as unknown as { column_name: string }).column_name)) : [];
        }
      }

      if (isPreview) {
        // ... (Preview logic skipped for deep background refactor simplicity, assuming preview uses sync or handles differently,
        // but if preview IS requested here, we shouldn't insert to DB).
        // For now, if preview is true, we just accumulate and do nothing with DB.
         for (const row of batch) {
          if (previewRows.length < PREVIEW_LIMIT) {
             const saneRow: Record<string, any> = {};
             for (const key in row) {
               const saneKey = key.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
               saneRow[saneKey] = sanitizeForPostgres(row[key]);
             }
             if (body?.etlId) saneRow["etl_id"] = body.etlId;
             previewRows.push(saneRow);
          }
        }
        return;
      }

      // --- INSERT TO DB ---
      const allowedKeys = tableColumnNames && tableColumnNames.length > 0
        ? new Set(tableColumnNames.map((c) => c.toLowerCase()))
        : null;
      const batchToInsert = batch.map((row) => {
        const saneRow: Record<string, any> = {};
        for (const key in row) {
          const saneKey = key.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
          if (allowedKeys === null || allowedKeys.has(saneKey)) {
            const v = sanitizeForPostgres(row[key]);
            saneRow[saneKey] = v === undefined ? null : v;
          }
        }
        if (body?.etlId) {
          saneRow["etl_id"] = body.etlId;
        }
        return saneRow;
      });

      const numColumns = batchToInsert[0] ? Object.keys(batchToInsert[0]).length : 1;
      const insertChunkSize = Math.min(
        INSERT_CHUNK_SIZE_DEFAULT,
        Math.max(1, Math.floor(MAX_PARAMS_PER_QUERY / numColumns))
      );

      try {
        for (let i = 0; i < batchToInsert.length; i += insertChunkSize) {
          const chunk = batchToInsert.slice(i, i + insertChunkSize);
          if (chunk.length > 0) {
            await withRetry(
              () => sqlPersistent`INSERT INTO etl_output.${sqlPersistent(newTableName)} ${sqlPersistent(chunk)}`,
              { label: "insert-batch" }
            );
          }
        }
      } catch (insErr: any) {
        throw new Error(`Error guardando lote: ${insErr.message}`);
      }
    };

    // --- DATA SOURCE GENERATOR ---
    async function* dataSourceGenerator(): AsyncGenerator<any[], void, void> {
      const unionConf = body!.union;
      const rightSources = unionConf?.rights ?? (unionConf?.right ? [unionConf.right] : []);
      if (unionConf?.left?.connectionId && rightSources.length > 0) {
        // UNION: apilar Dataset principal + una o más tablas (mismas columnas). Default UNION ALL.
        const left = unionConf.left;
        const pageSizeUnion = pageSize;
        const dbUrlUnion = process.env.SUPABASE_DB_URL;
        if (!dbUrlUnion) throw new Error("SUPABASE_DB_URL no disponible para UNION.");

        const resolveTableAndConn = async (
          connId: string,
          filter?: { table?: string; columns?: string[]; conditions?: FilterCondition[] }
        ) => {
          const { data: c } = await supabaseAdmin.from("connections").select("*").eq("id", connId).single();
          if (!c) throw new Error(`Conexión ${connId} no encontrada.`);
          if (c.type === "excel_file") {
            const { data: meta } = await supabaseAdmin.from("data_tables").select("physical_schema_name, physical_table_name").eq("connection_id", connId).single();
            if (!meta?.physical_table_name) throw new Error(`Sin tabla física para conexión Excel ${connId}.`);
            return { table: `${meta.physical_schema_name || "data_warehouse"}.${meta.physical_table_name}`, conn: c, type: "excel" };
          }
          const t = (filter?.table || "").trim();
          if (!t) throw new Error(`UNION: la fuente debe tener tabla (filter.table) para conexión ${connId}.`);
          return { table: t, conn: c, type: c.type };
        };

        const leftInfo = await resolveTableAndConn(left.connectionId, left.filter);
        const rightInfos = await Promise.all(rightSources.map((r: { connectionId: string; filter?: { table?: string; columns?: string[]; conditions?: FilterCondition[] } }) => resolveTableAndConn(r.connectionId, r.filter)));
        if (leftInfo.type !== "excel" || rightInfos.some((r) => r.type !== "excel")) {
          const allSameConn = rightInfos.every((r) => r.conn && left.connectionId === (r.conn as any).id);
          if (!allSameConn)
            throw new Error("UNION con varias conexiones solo soportado cuando todas son Excel. Usá la misma conexión para Postgres.");
        }

        const clientUnion = new PgClient({ connectionString: dbUrlUnion, connectionTimeoutMillis: 15000, statement_timeout: 600000 });
        await withRetry(() => clientUnion.connect(), { label: "union-connect" });
        try {
          const runSource = async (
            source: { connectionId: string; filter?: { table?: string; columns?: string[]; conditions?: FilterCondition[] } },
            tableQualified: string,
            options?: { conditionsOverride?: FilterCondition[]; dateFilter?: DateFilterSpec }
          ) => {
            const filter = source.filter || {};
            const tableQ = quoteQualified(tableQualified);
            const selectList = filter.columns?.length ? filter.columns.map((c: string) => quoteIdent(c, "postgres")).join(", ") : "*";
            const conds = options?.conditionsOverride ?? filter.conditions ?? [];
            const { clause: condClause, params: condParams } = buildWhereClausePg(conds);
            const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentPg(options?.dateFilter, condParams.length + 1);
            const clause = dfClause ? (condClause ? `${condClause} AND ${dfClause}` : `WHERE ${dfClause}`) : condClause;
            const params = [...condParams, ...dfParams];
            const base = `SELECT ${selectList} FROM ${tableQ} ${clause} `;
            const batches: any[][] = [];
            let offset = 0;
            for (;;) {
              const q = `${base} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
              const res = await clientUnion.query(q, [...params, pageSizeUnion, offset]);
              const rows = (res.rows || []).map((r: Record<string, any>) => {
                const out: Record<string, any> = {};
                for (const k in r) {
                  out[k.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()] = r[k];
                }
                return out;
              });
              if (rows.length === 0) break;
              batches.push(rows);
              if (rows.length < pageSizeUnion) break;
              offset += pageSizeUnion;
            }
            return batches;
          };

          const leftTable = leftInfo.table;
          let leftCols: string[] | null = null;
          for (const batch of await runSource(left, leftTable, { conditionsOverride: sqlConditions, dateFilter })) {
            if (batch.length && leftCols === null) leftCols = Object.keys(batch[0]).sort();
            yield batch;
          }
          for (let r = 0; r < rightSources.length; r++) {
            const right = rightSources[r];
            const rightInfo = rightInfos[r];
            const rightBatches = await runSource(right, rightInfo.table, { dateFilter });
            for (const batch of rightBatches) {
              if (batch.length) {
                const rightCols = Object.keys(batch[0]).sort();
                if (leftCols && rightCols.join(",") !== leftCols.join(","))
                  throw new Error("UNION: todos los datasets deben tener las mismas columnas (nombre y orden).");
              }
              yield batch;
            }
          }
        } finally {
          await clientUnion.end();
        }
        return;
      }

      const joinObj: any = (body as any).join;
      const isJoin = !!joinObj;
      const isStarJoin = isJoin && !!joinObj.primaryConnectionId && Array.isArray(joinObj.joins);
      const primaryConnId = isStarJoin ? joinObj.primaryConnectionId : isJoin ? joinObj.connectionId : body!.connectionId;
      
      if (!primaryConnId) throw new Error("ID de conexión primario no encontrado.");

      const { data: conn } = await supabaseAdmin
        .from("connections")
        .select("*")
        .eq("id", primaryConnId)
        .single();
      if (!conn) throw new Error(`Conexión ${primaryConnId} no encontrada.`);

      // Firebird: tabla simple o JOIN en memoria (soporta Firebird + Firebird/Postgres)
      if (conn.type === "firebird") {
        const password =
          (conn as any).db_password_encrypted
            ? decryptConnectionPassword((conn as any).db_password_encrypted)
            : (conn as any).db_password ?? "";
        const safePart = (s: string) => /^[A-Z0-9_]+$/i.test(s) ? s.toUpperCase() : `"${s.replace(/"/g, '""')}"`;
        const normalizeRow = (row: Record<string, any>) => {
          const out: Record<string, any> = {};
          for (const k in row) {
            out[k.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()] = row[k];
          }
          return out;
        };

        if (isJoin) {
          // JOIN en memoria: resolver tabla izquierda (Firebird) y derecha (Firebird o Postgres)
          const isStar = isStarJoin && Array.isArray(joinObj.joins) && joinObj.joins.length > 0;
          const leftTable = isStar ? (joinObj.primaryTable || (body!.filter?.table || "").trim()) : (joinObj.leftTable || "").trim();
          const rightTable = isStar ? (joinObj.joins![0] as any).secondaryTable : (joinObj.rightTable || "").trim();
          const jc = isStar ? (joinObj.joins![0] as any) : (joinObj.joinConditions?.[0] || {});
          const leftCol = (jc.primaryColumn || jc.leftColumn || "").trim();
          const rightCol = (jc.secondaryColumn || jc.rightColumn || "").trim();
          const secondaryConnId = isStar ? (joinObj.joins![0] as any).secondaryConnectionId : joinObj.secondaryConnectionId;
          if (!leftTable || !rightTable || !leftCol || !rightCol || !secondaryConnId)
            throw new Error("JOIN con Firebird requiere tabla izquierda, tabla derecha, columnas de enlace y conexión secundaria.");

          const { data: conn2 } = await supabaseAdmin.from("connections").select("*").eq("id", secondaryConnId).single();
          if (!conn2) throw new Error(`Conexión secundaria ${secondaryConnId} no encontrada.`);

          const selectedCols = (body!.filter?.columns || []) as string[];
          const leftColumns = selectedCols.filter((c: string) => /^primary\./i.test(c)).map((c: string) => c.replace(/^primary\./i, "").trim());
          const rightColumns = selectedCols.filter((c: string) => /^join_0\./i.test(c)).map((c: string) => c.replace(/^join_0\./i, "").trim());
          const leftConditions = (sqlConditions as FilterCondition[])
            .filter((c: FilterCondition) => /^primary\./i.test(c.column || ""))
            .map((c: FilterCondition) => ({ ...c, column: (c.column || "").replace(/^primary\./i, "").trim() }));
          const rightConditions = (sqlConditions as FilterCondition[])
            .filter((c: FilterCondition) => /^join_0\./i.test(c.column || ""))
            .map((c: FilterCondition) => ({ ...c, column: (c.column || "").replace(/^join_0\./i, "").trim() }));

          const fetchFromConnection = async (
            connection: any,
            tableName: string,
            columns: string[] | undefined,
            conditions: FilterCondition[],
            dateFilterOpt?: DateFilterSpec
          ): Promise<Record<string, any>[]> => {
            const connType = (connection.type || "").toLowerCase();
            const pwd = connection.db_password_encrypted
              ? decryptConnectionPassword(connection.db_password_encrypted)
              : (connection.db_password ?? "");
            const tablePart = tableName.includes(".")
              ? (tableName.split(".").pop() || tableName).trim().toUpperCase()
              : safePart(tableName.trim());
            const { clause, params } = buildWhereClauseFirebird(
              conditions.map((c) => ({ ...c, column: (c.column || "").trim() })).filter((c) => (c.column ?? "").length > 0)
            );
            if (connType === "firebird") {
              const colForFb = (dateFilterOpt?.column || "").replace(/^primary\./i, "").replace(/^join_\d+\./i, "").trim();
              const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentFirebird(
                dateFilterOpt?.column ? { ...dateFilterOpt, column: colForFb } : dateFilterOpt
              );
              const mergedClause = dfClause ? (clause ? `${clause} AND ${dfClause}` : `WHERE ${dfClause}`) : clause;
              const mergedParams = [...params, ...dfParams];
              const Firebird = require("node-firebird");
              const opts = {
                host: connection.db_host || "localhost",
                port: connection.db_port ? Number(connection.db_port) : 15421,
                database: connection.db_name,
                user: connection.db_user,
                password: pwd || "",
                lowercase_keys: false,
              };
              const limit = ETL_MAX_ROWS_CEILING;
              return new Promise((resolve, reject) => {
                Firebird.attach(opts, (err: Error | null, db: any) => {
                  if (err) return reject(err);
                  const cols = "*";
                  const escapeFb = (v: any): string => {
                    if (v == null) return "NULL";
                    if (typeof v === "boolean") return v ? "1" : "0";
                    if (typeof v === "number" && !Number.isNaN(v)) return Number.isInteger(v) ? String(v) : `CAST('${v}' AS DOUBLE PRECISION)`;
                    return `'${String(v).replace(/'/g, "''")}'`;
                  };
                  let clauseInlined = mergedClause;
                  for (const p of mergedParams) {
                    const pos = clauseInlined.indexOf("?");
                    if (pos === -1) break;
                    clauseInlined = clauseInlined.slice(0, pos) + escapeFb(p) + clauseInlined.slice(pos + 1);
                  }
                  db.query(`SELECT FIRST ${limit} ${cols} FROM ${tablePart} ${clauseInlined}`.trim(), [], (qerr: Error | null, rows: any[]) => {
                    if (db?.detach) try { db.detach(() => {}); } catch (_) {}
                    if (qerr) return reject(qerr);
                    resolve((rows || []).map(normalizeRow));
                  });
                });
              });
            }
            if (connType === "postgres" || connType === "postgresql") {
              const pgClient = new PgClient({
                host: connection.db_host,
                user: connection.db_user,
                database: connection.db_name,
                port: connection.db_port ?? 5432,
                password: pwd || undefined,
                connectionTimeoutMillis: 15000,
                statement_timeout: 600000,
              });
              await pgClient.connect();
              try {
                const sel = columns?.length ? columns.map((c) => quoteIdent(c)).join(", ") : "*";
                const { clause: pgClause, params: pgParams } = buildWhereClausePg(conditions);
                const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentPg(dateFilterOpt, pgParams.length + 1);
                const finalClause = dfClause ? (pgClause ? `${pgClause} AND ${dfClause}` : `WHERE ${dfClause}`) : pgClause;
                const finalParams = [...pgParams, ...dfParams];
                const q = `SELECT ${sel} FROM ${quoteQualified(tableName)} ${finalClause} `;
                const res = await pgClient.query(q, finalParams);
                return (res.rows || []).map(normalizeRow);
              } finally {
                await pgClient.end();
              }
            }
            throw new Error(`JOIN con Firebird: conexión secundaria tipo "${connection.type}" no soportada. Usá Firebird o Postgres.`);
          };

          const resolveRightColCase = (col: string) =>
            rightColumns.find((rc: string) => rc.toUpperCase() === (col || "").trim().toUpperCase()) ?? (col || "").trim();
          const rawDateColFb = (dateFilter?.column ?? "").trim();
          const isDateFilterOnRightFb = /^join_0\.\s*/i.test(rawDateColFb);
          const dateFilterForRight =
            dateFilter?.column && isDateFilterOnRightFb
              ? { ...dateFilter, column: resolveRightColCase(rawDateColFb.replace(/^join_0\.\s*/i, "").trim()) }
              : undefined;

          const rightRows = await fetchFromConnection(conn2, rightTable, rightColumns.length ? rightColumns : undefined, rightConditions, dateFilterForRight);
          const rightColNorm = rightCol.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
          const rightMap = new Map<string, Record<string, any>[]>();
          for (const r of rightRows) {
            const key = String(r[rightColNorm] ?? (r as any)[rightCol] ?? "");
            if (!rightMap.has(key)) rightMap.set(key, []);
            rightMap.get(key)!.push(r);
          }
          const leftColNorm = leftCol.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
          const joinType = (jc.joinType || "INNER").toString().toUpperCase();

          const leftTablePart = leftTable.includes(".") ? (leftTable.split(".").pop() || leftTable).trim().toUpperCase() : safePart(leftTable);
          const resolveColCase = (col: string) => leftColumns.find((lc) => lc.toUpperCase() === (col || "").trim().toUpperCase()) ?? (col || "").trim();
          const leftFbConditions = leftConditions
            .map((c) => ({ ...c, column: resolveColCase(c.column || "") }))
            .filter((c) => c.column.length > 0);
          const { clause: leftClause, params: leftParams } = buildWhereClauseFirebird(leftFbConditions);
          const rawDateColLeft = (dateFilter?.column ?? "").trim().replace(/^primary\./i, "").trim();
          const resolvedDateCol = rawDateColLeft ? resolveColCase(rawDateColLeft) : rawDateColLeft;
          const leftDateFilterFb =
            dateFilter?.column && !isDateFilterOnRightFb && rawDateColLeft
              ? { ...dateFilter, column: resolvedDateCol }
              : undefined;
          const { clause: leftDfClause, params: leftDfParams } = buildDateFilterWhereFragmentFirebird(leftDateFilterFb);
          const mergedLeftClause = leftDfClause ? (leftClause ? `${leftClause} AND ${leftDfClause}` : `WHERE ${leftDfClause}`) : leftClause;
          const mergedLeftParams = [...leftParams, ...leftDfParams];
          const Firebird = require("node-firebird");
          const opts = {
            host: conn.db_host || "localhost",
            port: conn.db_port ? Number(conn.db_port) : 15421,
            database: conn.db_name,
            user: conn.db_user,
            password: password || "",
            lowercase_keys: false,
          };
          const leftCols = leftColumns.length ? leftColumns : [];
          let db: any = null;
          try {
            db = await withRetry(
              () =>
                new Promise<any>((resolve, reject) => {
                  Firebird.attach(opts, (err: Error | null, connection: any) => {
                    if (err) reject(err);
                    else resolve(connection);
                  });
                }),
              { label: "firebird-attach-join" }
            );
            let offset = 0;
            for (;;) {
              // Firebird: SELECT * para evitar -206 (Column unknown) por nombre/casing.
              const cols = "*";
              const sql =
                offset === 0
                  ? `SELECT FIRST ${pageSize} ${cols} FROM ${leftTablePart} ${mergedLeftClause}`
                  : `SELECT FIRST ${pageSize} SKIP ${offset} ${cols} FROM ${leftTablePart} ${mergedLeftClause}`;
              const leftRows = await withRetry(
                () =>
                  new Promise<any[]>((resolve, reject) => {
                    db.query(sql, mergedLeftParams, (err: Error | null, r: any[]) => {
                      if (err) reject(err);
                      else resolve(r || []);
                    });
                  }),
                { label: "firebird-query-join" }
              );
              const leftNorm = leftRows.map(normalizeRow);
              if (leftNorm.length === 0) break;

              const leftKeys = leftCols.length ? leftCols.map((c) => c.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()) : (leftNorm[0] ? Object.keys(leftNorm[0]) : []);
              const rightKeys = rightColumns.length ? rightColumns.map((c) => c.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()) : (rightRows[0] ? Object.keys(rightRows[0]) : []);

              const prefixLeft = (row: Record<string, any>) => {
                const out: Record<string, any> = {};
                if (leftKeys.length) for (const k of leftKeys) out["primary_" + k] = row[k];
                else for (const key in row) out["primary_" + key] = row[key];
                return out;
              };
              const prefixRight = (row: Record<string, any>) => {
                const out: Record<string, any> = {};
                if (rightKeys.length) for (const k of rightKeys) out["join_0_" + k] = row[k];
                else for (const key in row) out["join_0_" + key] = row[key];
                return out;
              };

              const batch: Record<string, any>[] = [];
              for (const lr of leftNorm) {
                const key = String(lr[leftColNorm] ?? (lr as any)[leftCol] ?? "");
                const matches = rightMap.get(key) ?? [];
                if (matches.length > 0) {
                  for (const rr of matches) batch.push({ ...prefixLeft(lr), ...prefixRight(rr) });
                } else if ((joinType === "LEFT" || joinType === "FULL") && !isDateFilterOnRightFb) {
                  const rightNulls: Record<string, any> = {};
                  for (const k of rightKeys) rightNulls["join_0_" + k] = null;
                  if (!rightKeys.length) for (const key in (rightRows[0] || {})) rightNulls["join_0_" + key] = null;
                  batch.push({ ...prefixLeft(lr), ...rightNulls });
                }
              }
              if (batch.length > 0) yield batch;
              if (leftNorm.length < pageSize) break;
              offset += pageSize;
            }
          } finally {
            if (db?.detach) db.detach(() => {});
          }
          return;
        }

        // Firebird: una sola tabla
        const tableToQuery = (body!.filter?.table || "").trim();
        if (!tableToQuery) throw new Error("Tabla de origen requerida.");
        const tablePart = tableToQuery.includes(".")
          ? (tableToQuery.split(".").pop() || tableToQuery).trim().toUpperCase()
          : safePart(tableToQuery);
        const cols = "*";
        const firebirdConditions = (sqlConditions as FilterCondition[])
          .map((c) => ({
            ...c,
            column: (c.column || "").replace(/^primary\./i, "").replace(/^join_\d+\./i, "").trim(),
          }))
          .filter((c) => (c.column ?? "").length > 0);
        const { clause, params } = buildWhereClauseFirebird(firebirdConditions);
        const dateFilterFb = dateFilter?.column
          ? { ...dateFilter, column: (dateFilter.column || "").replace(/^primary\./i, "").trim() }
          : dateFilter;
        const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentFirebird(dateFilterFb);
        const mergedClause = dfClause ? (clause ? `${clause} AND ${dfClause}` : `WHERE ${dfClause}`) : clause;
        const mergedParams = [...params, ...dfParams];
        const Firebird = require("node-firebird");
        const opts = {
          host: conn.db_host || "localhost",
          port: conn.db_port ? Number(conn.db_port) : 15421,
          database: conn.db_name,
          user: conn.db_user,
          password: password || "",
          lowercase_keys: false,
        };
        let offset = 0;
        let db: any = null;
        try {
          db = await withRetry(
            () =>
              new Promise<any>((resolve, reject) => {
                Firebird.attach(opts, (err: Error | null, connection: any) => {
                  if (err) reject(err);
                  else resolve(connection);
                });
              }),
            { label: "firebird-attach" }
          );
          for (;;) {
            const sql =
              offset === 0
                ? `SELECT FIRST ${pageSize} ${cols} FROM ${tablePart} ${mergedClause}`
                : `SELECT FIRST ${pageSize} SKIP ${offset} ${cols} FROM ${tablePart} ${mergedClause}`;
            const rows = await withRetry(
              () =>
                new Promise<any[]>((resolve, reject) => {
                  db.query(sql, mergedParams, (err: Error | null, r: any[]) => {
                    if (err) reject(err);
                    else resolve(r || []);
                  });
                }),
              { label: "firebird-query" }
            );
            const normalized = rows.map(normalizeRow);
            if (normalized.length === 0) break;
            yield normalized;
            if (normalized.length < pageSize) break;
            offset += pageSize;
          }
        } finally {
          if (db?.detach) db.detach(() => {});
        }
        return;
      }

      // JOIN entre dos conexiones distintas (cross-DB): ejecutar en memoria
      const secondaryConnIdForCrossDb = isStarJoin ? (joinObj.joins?.[0] as any)?.secondaryConnectionId : joinObj.secondaryConnectionId;
      if (isJoin && secondaryConnIdForCrossDb && String(primaryConnId) !== String(secondaryConnIdForCrossDb)) {
        const { data: conn2 } = await supabaseAdmin.from("connections").select("*").eq("id", secondaryConnIdForCrossDb).single();
        if (!conn2) throw new Error(`Conexión secundaria ${secondaryConnIdForCrossDb} no encontrada.`);
        const isStar = isStarJoin && Array.isArray(joinObj.joins) && joinObj.joins.length > 0;
        const leftTable = isStar ? (joinObj.primaryTable || (body!.filter?.table || "").trim()) : (joinObj.leftTable || "").trim();
        const rightTable = isStar ? (joinObj.joins![0] as any).secondaryTable : (joinObj.rightTable || "").trim();
        const jc = isStar ? (joinObj.joins![0] as any) : (joinObj.joinConditions?.[0] || {});
        const leftCol = (jc.primaryColumn || jc.leftColumn || "").trim();
        const rightCol = (jc.secondaryColumn || jc.rightColumn || "").trim();
        const joinType = (jc.joinType || "INNER").toString().toUpperCase();
        const selectedCols = (body!.filter?.columns || []) as string[];
        const leftColumns = selectedCols.filter((c: string) => /^primary\./i.test(c)).map((c: string) => c.replace(/^primary\./i, "").trim());
        const rightColumns = selectedCols.filter((c: string) => /^join_0\./i.test(c)).map((c: string) => c.replace(/^join_0\./i, "").trim());
        const leftConditions = (sqlConditions as FilterCondition[])
          .filter((c: FilterCondition) => /^primary\./i.test(c.column || ""))
          .map((c: FilterCondition) => ({ ...c, column: (c.column || "").replace(/^primary\./i, "").trim() }));
        const rightConditions = (sqlConditions as FilterCondition[])
          .filter((c: FilterCondition) => /^join_0\./i.test(c.column || ""))
          .map((c: FilterCondition) => ({ ...c, column: (c.column || "").replace(/^join_0\./i, "").trim() }));
        if (!leftTable || !rightTable || !leftCol || !rightCol)
          throw new Error("JOIN entre conexiones distintas requiere tabla izquierda, derecha y columnas de enlace.");

        const normalizeRowCrossDb = (row: Record<string, any>) => {
          const out: Record<string, any> = {};
          for (const k in row) out[k.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()] = row[k];
          return out;
        };

        const createCrossDbClient = async (connection: any): Promise<{ client: PgClient; resolvedTable: string }> => {
          const connType = (connection.type || "").toLowerCase();
          const pwd = connection.db_password_encrypted
            ? decryptConnectionPassword(connection.db_password_encrypted)
            : (connection.db_password ?? "");
          if (connType === "postgres" || connType === "postgresql") {
            const c = new PgClient({
              host: connection.db_host, user: connection.db_user,
              database: connection.db_name, port: connection.db_port ?? 5432,
              password: pwd || undefined,
              connectionTimeoutMillis: 15000, statement_timeout: 600000,
            });
            await c.connect();
            return { client: c, resolvedTable: "" };
          }
          if (connType === "excel_file") {
            const dbUrl = process.env.SUPABASE_DB_URL;
            if (!dbUrl) throw new Error("SUPABASE_DB_URL no disponible para JOIN con Excel.");
            const { data: meta } = await supabaseAdmin
              .from("data_tables")
              .select("physical_schema_name, physical_table_name")
              .eq("connection_id", String(connection.id))
              .single();
            if (!meta?.physical_table_name) throw new Error("Metadatos Excel no encontrados para la conexión secundaria.");
            const physicalTable = `${meta.physical_schema_name || "data_warehouse"}.${meta.physical_table_name}`;
            const c = new PgClient({ connectionString: dbUrl, connectionTimeoutMillis: 15000, statement_timeout: 600000 });
            await c.connect();
            return { client: c, resolvedTable: physicalTable };
          }
          throw new Error(`JOIN entre conexiones: tipo "${connection.type}" no soportado.`);
        };

        const queryCrossDb = async (
          pgClient: PgClient,
          tableName: string,
          columns: string[] | undefined,
          conditions: FilterCondition[],
          limit?: number,
          offset?: number,
          dateFilter?: DateFilterSpec
        ): Promise<Record<string, any>[]> => {
          const { clause: condClause, params: condParams } = buildWhereClausePg(conditions);
          const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentPg(dateFilter, condParams.length + 1);
          const clause = dfClause ? (condClause ? `${condClause} AND ${dfClause}` : `WHERE ${dfClause}`) : condClause;
          const params = [...condParams, ...dfParams];
          const sel = columns?.length ? columns.map((c) => quoteIdent(c)).join(", ") : "*";
          const limitVal = limit ?? ETL_MAX_ROWS_CEILING;
          const offsetVal = offset ?? 0;
          const q = `SELECT ${sel} FROM ${quoteQualified(tableName)} ${clause}  LIMIT ${limitVal} OFFSET ${offsetVal}`;
          const res = await pgClient.query(q, params);
          return (res.rows || []).map(normalizeRowCrossDb);
        };

        const resolveRightColCase = (col: string) =>
          rightColumns.find((rc: string) => rc.toUpperCase() === (col || "").trim().toUpperCase()) ?? (col || "").trim();
        const dateFilterCol = (dateFilter?.column ?? "").trim();
        const isDateFilterOnRight = /^join_0\.\s*/i.test(dateFilterCol);
        const dateFilterForRight =
          dateFilter?.column && isDateFilterOnRight
            ? { ...dateFilter, column: resolveRightColCase(dateFilterCol.replace(/^join_0\.\s*/i, "").trim()) }
            : undefined;
        const leftDateFilter =
          dateFilter && !isDateFilterOnRight && dateFilterCol
            ? { ...dateFilter, column: dateFilterCol.replace(/^primary\./i, "").trim() }
            : undefined;

        const { client: rightClient, resolvedTable: rightResolvedTable } = await createCrossDbClient(conn2);
        const rightTableQ = rightResolvedTable || rightTable;
        const { client: leftClient, resolvedTable: leftResolvedTable } = await createCrossDbClient(conn);
        const leftTableQ = leftResolvedTable || leftTable;
        try {
          const rightColNorm = rightCol.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
          const rightMap = new Map<string, Record<string, any>[]>();
          let rightSampleRow: Record<string, any> | undefined;
          let rightOffset = 0;
          for (;;) {
            const rightBatch = await queryCrossDb(rightClient, rightTableQ, rightColumns.length ? rightColumns : undefined, rightConditions, pageSize, rightOffset, dateFilterForRight);
            for (const r of rightBatch) {
              if (!rightSampleRow) rightSampleRow = r;
              const key = String(r[rightColNorm] ?? (r as any)[rightCol] ?? "");
              if (!rightMap.has(key)) rightMap.set(key, []);
              rightMap.get(key)!.push(r);
            }
            if (rightBatch.length < pageSize) break;
            rightOffset += pageSize;
          }

          const leftColNorm = leftCol.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
          const rightKeys = rightColumns.length ? rightColumns.map((c) => c.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()) : (rightSampleRow ? Object.keys(rightSampleRow) : []);

          const prefixLeft = (row: Record<string, any>) => {
            const out: Record<string, any> = {};
            const leftKeys = leftColumns.length ? leftColumns.map((c) => c.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()) : Object.keys(row);
            if (leftKeys.length) for (const k of leftKeys) out["primary_" + k] = row[k];
            else for (const key in row) out["primary_" + key] = row[key];
            return out;
          };
          const prefixRight = (row: Record<string, any>) => {
            const out: Record<string, any> = {};
            if (rightKeys.length) for (const k of rightKeys) out["join_0_" + k] = row[k];
            else for (const key in row) out["join_0_" + key] = row[key];
            return out;
          };
          let leftOffset = 0;
          for (;;) {
            const leftNorm = await queryCrossDb(leftClient, leftTableQ, leftColumns.length ? leftColumns : undefined, leftConditions, pageSize, leftOffset, leftDateFilter);
            if (leftNorm.length === 0) break;
            const batch: Record<string, any>[] = [];
            for (const lr of leftNorm) {
              const key = String(lr[leftColNorm] ?? (lr as any)[leftCol] ?? "");
              const matches = rightMap.get(key) ?? [];
              if (matches.length > 0) {
                for (const rr of matches) batch.push({ ...prefixLeft(lr), ...prefixRight(rr) });
              } else if ((joinType === "LEFT" || joinType === "FULL") && !isDateFilterOnRight) {
                const rightNulls: Record<string, any> = {};
                for (const k of rightKeys) rightNulls["join_0_" + k] = null;
                if (!rightKeys.length && rightSampleRow) for (const key in rightSampleRow) rightNulls["join_0_" + key] = null;
                batch.push({ ...prefixLeft(lr), ...rightNulls });
              }
            }
            if (batch.length > 0) yield batch;
            if (leftNorm.length < pageSize) break;
            leftOffset += pageSize;
          }
        } finally {
          await rightClient.end().catch(() => {});
          await leftClient.end().catch(() => {});
        }
        return;
      }

      let client: PgClient;
      if (conn.type === "excel_file") {
        const dbUrl = process.env.SUPABASE_DB_URL;
        if (!dbUrl) throw new Error("SUPABASE_DB_URL no disponible.");
        client = new PgClient({ connectionString: dbUrl, connectionTimeoutMillis: 15000, statement_timeout: 600000 });
      } else if (conn.type === "postgres" || conn.type === "postgresql") {
        const password =
          (conn as any).db_password_encrypted
            ? decryptConnectionPassword((conn as any).db_password_encrypted)
            : undefined;
        client = new PgClient({
          host: conn.db_host || undefined,
          user: conn.db_user || undefined,
          database: conn.db_name || undefined,
          port: conn.db_port ?? 5432,
          password: password || undefined,
          connectionTimeoutMillis: 15000,
          statement_timeout: 600000,
        });
      } else {
        throw new Error(`Tipo de conexión no soportado: ${conn.type}.`);
      }

      await withRetry(() => client.connect(), { label: "db-connect" });

      try {
        let baseQuery: string;
        let queryParams: any[] = [];

        const castMap = new Map<string, { column: string; targetType: CastTargetType }>();
        if (body!.cast?.conversions) {
          for (const cv of body!.cast.conversions) {
            castMap.set(cv.column, cv);
          }
        }

        if (isJoin) {
           // ... JOIN LOGIC (Binary & Star) ...
           // Reusing exact logic from original router
           const star = joinObj;
           if (!isStarJoin) {
              // Binary
              const { leftTable, rightTable, joinConditions, leftColumns, rightColumns } = joinObj;
              const mappedConds = (sqlConditions as FilterCondition[]).map((c) => {
                  const col = c.column || "";
                  let mapped = col.replace(/^primary\./i, "left.");
                  mapped = mapped.replace(/^join_0\./i, "right.");
                  return { ...c, column: mapped } as any;
              });
               if (conn.type === "excel_file") {
                 const resolvePhysical = async (connId: string | number) => {
                    const { data: meta } = await supabaseAdmin
                      .from("data_tables")
                      .select("physical_schema_name, physical_table_name")
                      .eq("connection_id", String(connId))
                      .single();
                    if (!meta) throw new Error("Metadatos no encontrados");
                    return `${meta.physical_schema_name || "data_warehouse"}.${meta.physical_table_name}`;
                 };
                 const lPhys = await resolvePhysical(joinObj.connectionId);
                 const rPhys = await resolvePhysical(joinObj.secondaryConnectionId);
                 const lQ = quoteQualified(lPhys);
                 const rQ = quoteQualified(rPhys);

                 const selectParts: string[] = [];
                 if (leftColumns?.length) leftColumns.forEach((c: string) => selectParts.push(`l.${quoteIdent(c)} AS "primary_${c.replace(/"/g, '""')}"`));
                 else selectParts.push("l.*");
                 if (rightColumns?.length) rightColumns.forEach((c: string) => selectParts.push(`r.${quoteIdent(c)} AS "join_0_${c.replace(/"/g, '""')}"`));
                 else selectParts.push("r.*");
                 
                 const joinClause = buildJoinClauseBinary(joinConditions, "postgres", rQ);
                 const { clause: mcClause, params: mcParams } = buildWhereClausePg(mappedConds);
                 const rawDateColBin = (dateFilter?.column ?? "").trim();
                 const isDateOnRightBin = /^join_0\.\s*/i.test(rawDateColBin);
                 const binaryDateFilter = !dateFilter ? undefined : rawDateColBin
                   ? { ...dateFilter, column: isDateOnRightBin ? rawDateColBin.replace(/^join_0\.\s*/i, "").trim() : rawDateColBin.replace(/^primary\./i, "").trim() }
                   : dateFilter;
                 const binaryDatePrefix = isDateOnRightBin ? "r." : "l.";
                 const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentPg(binaryDateFilter, mcParams.length + 1, binaryDatePrefix);
                 const clause = dfClause ? (mcClause ? `${mcClause} AND ${dfClause}` : `WHERE ${dfClause}`) : mcClause;
                 const params = [...mcParams, ...dfParams];
                 baseQuery = `SELECT ${selectParts.join(", ")} FROM ${lQ} AS l ${joinClause} ${clause}`;
                 queryParams = params;
               } else {
                 // Postgres Binary
                 const lQ = quoteQualified(leftTable);
                 const rQ = quoteQualified(rightTable);
                 const selectParts: string[] = [];
                 if (leftColumns?.length) leftColumns.forEach((c: string) => selectParts.push(`l.${quoteIdent(c)} AS "primary_${c.replace(/"/g, '""')}"`));
                 else selectParts.push("l.*");
                 if (rightColumns?.length) rightColumns.forEach((c: string) => selectParts.push(`r.${quoteIdent(c)} AS "join_0_${c.replace(/"/g, '""')}"`));
                 else selectParts.push("r.*");

                 const joinClause = buildJoinClauseBinary(joinConditions, "postgres", rQ);
                 const { clause: mcClause2, params: mcParams2 } = buildWhereClausePg(mappedConds);
                 const rawDateColBin2 = (dateFilter?.column ?? "").trim();
                 const isDateOnRightBin2 = /^join_0\.\s*/i.test(rawDateColBin2);
                 const binaryDateFilter2 = !dateFilter ? undefined : rawDateColBin2
                   ? { ...dateFilter, column: isDateOnRightBin2 ? rawDateColBin2.replace(/^join_0\.\s*/i, "").trim() : rawDateColBin2.replace(/^primary\./i, "").trim() }
                   : dateFilter;
                 const binaryDatePrefix2 = isDateOnRightBin2 ? "r." : "l.";
                 const { clause: dfClause2, params: dfParams2 } = buildDateFilterWhereFragmentPg(binaryDateFilter2, mcParams2.length + 1, binaryDatePrefix2);
                 const clause2 = dfClause2 ? (mcClause2 ? `${mcClause2} AND ${dfClause2}` : `WHERE ${dfClause2}`) : mcClause2;
                 const params2 = [...mcParams2, ...dfParams2];
                 baseQuery = `SELECT ${selectParts.join(", ")} FROM ${lQ} AS l ${joinClause} ${clause2}`;
                 queryParams = params2;
               }
           } else {
              // Star Join
               const { data: pConn } = await supabaseAdmin.from("connections").select("*").eq("id", String(star.primaryConnectionId)).single();
               const dbType = (pConn?.type || "postgres").toLowerCase();
               const selectedCols: string[] = body!.filter?.columns || [];
               const primarySelected = selectedCols.filter(c => c.startsWith("primary.")).map(c => c.slice("primary.".length));
               const joinsSelected: Record<string, string[]> = {};
               (star.joins || []).forEach((jn: any, idx: number) => {
                 const prefix = `join_${idx}.`;
                 const arr = selectedCols.filter(c => c.startsWith(prefix)).map(c => c.slice(prefix.length));
                 if (arr.length) {
                   joinsSelected[jn.id] = arr;
                   joinsSelected[`join_${idx}`] = arr; // fallback por índice por si jn.id no coincide (ej. UUID en editor)
                 }
               });

               if (dbType === "excel_file") {
                  const internalClient = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 15000, statement_timeout: 600000 });
                  await internalClient.connect();
                  try {
                     const resolvePhysical = async (connId: string | number) => {
                        const { data: meta } = await supabaseAdmin.from("data_tables").select("physical_schema_name, physical_table_name").eq("connection_id", String(connId)).single();
                        if (!meta) throw new Error("Metadatos no encontrados");
                        return `${meta.physical_schema_name || "data_warehouse"}.${meta.physical_table_name}`;
                     };
                     const pPhys = await resolvePhysical(star.primaryConnectionId);
                     const jPhyss = await Promise.all((star.joins||[]).map((jn: any) => resolvePhysical(jn.secondaryConnectionId)));
                     const pQ = quoteQualified(pPhys);
                     const jQs = jPhyss.map(q => quoteQualified(q));

                     const selectParts: string[] = [];
                     if (primarySelected.length) primarySelected.forEach(col => selectParts.push(`p.${quoteIdent(col)} AS "primary_${col.replace(/"/g, '""')}"`));
                     else selectParts.push("p.*");
                     for (let idx = 0; idx < (star.joins || []).length; idx++) {
                       const jn = (star.joins as any[])[idx];
                       let secCols: string[] = joinsSelected[jn.id] || joinsSelected[`join_${idx}`] || jn.secondaryColumns || [];
                       if (secCols.length === 0 && jPhyss[idx]) {
                         try {
                           const qual = jPhyss[idx] as string;
                           const [schema, table] = qual.includes(".") ? qual.split(".", 2) : ["data_warehouse", qual];
                           const colsRes = await internalClient.query(
                             "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
                             [schema, table]
                           );
                           secCols = (colsRes.rows || []).map((r: any) => String(r.column_name ?? ""));
                         } catch {
                           // fallback
                         }
                       }
                       if (secCols.length) secCols.forEach((col: string) => selectParts.push(`j${idx}.${quoteIdent(col)} AS "join_${idx}_${col.replace(/"/g, '""')}"`));
                       else selectParts.push(`j${idx}.*`);
                     }

                     let fromJoin = `FROM ${pQ} AS p`;
                     (star.joins||[]).forEach((jn: any, idx: number) => {
                        const jt = (jn.joinType || "INNER").toUpperCase();
                        const pc = (jn.primaryColumn || "").trim();
                        let leftAlias = "p", leftCol = pc;
                        if (pc.includes(".")) {
                          if (/^primary\./i.test(pc)) {
                            leftCol = pc.replace(/^primary\./i, "").trim();
                          } else {
                            const m = pc.match(/^join_(\d+)\.(.+)$/i);
                            if (m) {
                              const i = parseInt(m[1], 10);
                              if (!Number.isNaN(i) && i >= 0 && i < idx) {
                                leftAlias = `j${i}`;
                                leftCol = m[2].trim();
                              }
                            }
                          }
                        }
                        const on = `${leftAlias}.${quoteIdent(leftCol)} = j${idx}.${quoteIdent(jn.secondaryColumn||"")}`;
                        fromJoin += ` ${jt} JOIN ${jQs[idx]} AS j${idx} ON ${on}`;
                     });
                     
                     const { clause: starClause, params: starParams } = buildWhereClausePgStar(
                       sqlConditions,
                       (star.joins || []).length,
                       true
                     );
                     const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentPg(dateFilter, starParams.length + 1, "p.", (star.joins||[]).length);
                     const mergedClause = dfClause ? (starClause ? `${starClause} AND ${dfClause}` : `WHERE ${dfClause}`) : starClause;
                     const mergedParams = [...starParams, ...dfParams];
                     baseQuery = `SELECT ${selectParts.join(", ")} ${fromJoin} ${mergedClause} `;
                     queryParams = mergedParams;
                  } finally {
                     await internalClient.end();
                  }
               } else {
                  // Postgres Star
                  const pQ = quoteQualified(star.primaryTable || "");
                  const jQs = (star.joins||[]).map((jn: any) => quoteQualified(jn.secondaryTable || ""));
                  const selectParts: string[] = [];
                  if (primarySelected.length) primarySelected.forEach(col => selectParts.push(`p.${quoteIdent(col)} AS "primary_${col.replace(/"/g, '""')}"`));
                  else selectParts.push("p.*");
                  for (let idx = 0; idx < (star.joins || []).length; idx++) {
                    const jn = (star.joins as any[])[idx];
                    let secCols: string[] = joinsSelected[jn.id] || joinsSelected[`join_${idx}`] || jn.secondaryColumns || [];
                    if (secCols.length === 0 && jn.secondaryTable) {
                      try {
                        const [schema, table] = (jn.secondaryTable as string).includes(".")
                          ? (jn.secondaryTable as string).split(".", 2)
                          : ["public", (jn.secondaryTable as string)];
                        const colsRes = await client.query(
                          "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
                          [schema, table]
                        );
                        secCols = (colsRes.rows || []).map((r: any) => String(r.column_name ?? ""));
                      } catch {
                        // fallback: sin alias, puede dar nombres duplicados
                      }
                    }
                    if (secCols.length) secCols.forEach((col: string) => selectParts.push(`j${idx}.${quoteIdent(col)} AS "join_${idx}_${col.replace(/"/g, '""')}"`));
                    else selectParts.push(`j${idx}.*`);
                  }

                  let fromJoin = `FROM ${pQ} AS p`;
                  (star.joins||[]).forEach((jn: any, idx: number) => {
                      const jt = (jn.joinType || "INNER").toUpperCase();
                      const pc = (jn.primaryColumn || "").trim();
                      let leftAlias = "p", leftCol = pc;
                      if (pc.includes(".")) {
                        if (/^primary\./i.test(pc)) {
                          leftCol = pc.replace(/^primary\./i, "").trim();
                        } else {
                          const m = pc.match(/^join_(\d+)\.(.+)$/i);
                          if (m) {
                            const i = parseInt(m[1], 10);
                            if (!Number.isNaN(i) && i >= 0 && i < idx) {
                              leftAlias = `j${i}`;
                              leftCol = m[2].trim();
                            }
                          }
                        }
                      }
                      const on = `${leftAlias}.${quoteIdent(leftCol)} = j${idx}.${quoteIdent(jn.secondaryColumn||"")}`;
                      fromJoin += ` ${jt} JOIN ${jQs[idx]} AS j${idx} ON ${on}`;
                  });
                   
                  const { clause: starClause, params: starParams } = buildWhereClausePgStar(
                    sqlConditions,
                    (star.joins || []).length,
                    true
                  );
                  const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentPg(dateFilter, starParams.length + 1, "p.", (star.joins||[]).length);
                  const mergedClause = dfClause ? (starClause ? `${starClause} AND ${dfClause}` : `WHERE ${dfClause}`) : starClause;
                  const mergedParams = [...starParams, ...dfParams];
                  baseQuery = `SELECT ${selectParts.join(", ")} ${fromJoin} ${mergedClause}`;
                  queryParams = mergedParams;
               }
           }
        } else {
           // Simple Table Select
           let tableToQuery = body!.filter?.table;
           if (conn.type === "excel_file") {
              const { data: meta } = await supabaseAdmin.from("data_tables").select("physical_schema_name, physical_table_name").eq("connection_id", conn.id).single();
              if (!meta || !meta.physical_table_name) throw new Error("Metadatos Excel no encontrados");
              tableToQuery = `${meta.physical_schema_name || "excel_imports"}.${meta.physical_table_name}`;
           }
           if (!tableToQuery) throw new Error("Tabla de origen requerida.");
           
           const { columns } = body!.filter!;
           const tableQ = quoteQualified(tableToQuery);
           const selectList = columns && columns.length ? columns.map(c => {
              const cv = castMap.get(c);
              const ident = quoteIdent(c);
              if (cv) {
                  if ((cv.targetType === "date" || cv.targetType === "datetime") && (cv as any).inputFormat) return `${ident} AS ${ident}`;
                  return `${pgCastExpr(ident, cv.targetType)} AS ${ident}`;
              }
              return ident;
           }).join(", ") : "*";
           
           const { clause: condClause, params: condParams } = buildWhereClausePg(sqlConditions);
           const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentPg(dateFilter, condParams.length + 1);
           const clause = dfClause ? (condClause ? `${condClause} AND ${dfClause}` : `WHERE ${dfClause}`) : condClause;
           const params = [...condParams, ...dfParams];
           baseQuery = `SELECT ${selectList} FROM ${tableQ} ${clause} `;
           queryParams = params;
        }

        // --- FETCH AND PROCESS BATCHES ---
        let offset = 0;
        for (;;) {
          const batchQuery = `${baseQuery} LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
          const res = await client.query(batchQuery, [...queryParams, pageSize, offset]);
          const rows = res.rows || [];
          if (rows.length === 0) break;
          yield rows;
          if (rows.length < pageSize) break;
          offset += pageSize;
        }

      } finally {
        await client.end();
      }
    }

    // --- MAIN EXECUTION LOOP (pipeline: leer siguiente lote mientras se inserta el actual) ---
    /** Al inicio cada 2k para que se vea que avanza; después cada 5k. Evita que parezca "clavado". */
    const LOG_UPDATE_EARLY_EVERY = 2000;
    const LOG_UPDATE_EVERY_ROWS = 5000;
    const LOG_UPDATE_EARLY_UNTIL = 20000;
    let lastLoggedRows = 0;

    const gen = dataSourceGenerator();
    let iterResult = await gen.next();
    let rawBatch = iterResult.value as any[] | undefined;

    while (!iterResult.done && rawBatch != null && !pipelineTimedOut) {
      if (rawBatch.length === 0) {
        iterResult = await gen.next();
        rawBatch = iterResult.value as any[] | undefined;
        continue;
      }
      rowsProcessed += rawBatch.length;

      let transformedBatch = rawBatch;
      if (excludeRowsRules.length > 0) {
        transformedBatch = rawBatch.filter(
          (row) =>
            !excludeRowsRules.some(({ column, excluded }) =>
              excluded.includes(String(getValue(row, column) ?? ""))
            )
        );
      }
      if (body.pipeline?.length) {
         for (const step of body.pipeline) {
            try {
               switch (step.type) {
                  case "clean": transformedBatch = applyCleanBatch(transformedBatch, step.config); break;
                  case "cast": transformedBatch = applyCastConversions(transformedBatch, step.config); break;
                  case "arithmetic": transformedBatch = applyArithmeticOperations(transformedBatch, step.config); break;
                  case "condition": transformedBatch = applyConditionRules(transformedBatch, step.config); break;
               }
            } catch (err: any) {
               console.error("Pipeline Step Error", err);
               throw new Error(`Error en paso ${step.type}: ${err.message}`);
            }
         }
      } else {
         // Legacy mode
         transformedBatch = applyCleanBatch(rawBatch, body?.clean);
         if (body.cast?.conversions?.length) transformedBatch = applyCastConversions(transformedBatch, body.cast);
         if (body.arithmetic?.operations?.length) transformedBatch = applyArithmeticOperations(transformedBatch, body.arithmetic);
         if (body.condition?.rules?.length) transformedBatch = applyConditionRules(transformedBatch, body.condition);
      }

      if (body.count?.attribute) {
         const attr = body.count.attribute;
         for (const row of transformedBatch) {
             const val = getValue(row, attr);
             const key = val == null ? "__NULL__" : String(val);
             globalCountMap.set(key, (globalCountMap.get(key) || 0) + 1);
             if (!globalCountOriginalValues.has(key)) globalCountOriginalValues.set(key, val);
         }
         iterResult = await gen.next();
         rawBatch = iterResult.value as any[] | undefined;
         continue;
      }

      if (transformedBatch.length === 0) {
        iterResult = await gen.next();
        rawBatch = iterResult.value as any[] | undefined;
        continue;
      }

      // Pipeline: insertar este lote y pedir el siguiente en paralelo (los registros entran más rápido)
      const insertPromise = insertBatch(transformedBatch);
      const nextPromise = gen.next();
      await insertPromise;

      // --- REALTIME UPDATE: primer batch enseguida; al inicio cada 2k; después cada 5k ---
      const interval =
        rowsProcessed <= LOG_UPDATE_EARLY_UNTIL ? LOG_UPDATE_EARLY_EVERY : LOG_UPDATE_EVERY_ROWS;
      const shouldUpdate =
        lastLoggedRows === 0
          ? rowsProcessed > 0
          : rowsProcessed - lastLoggedRows >= interval;
      if (shouldUpdate) {
         try {
            await supabaseAdmin
              .from("etl_runs_log")
              .update({ rows_processed: rowsProcessed })
              .eq("id", runId);
            lastLoggedRows = rowsProcessed;
         } catch (logErr) {
            console.warn("[Background] Log update failed (non-fatal):", logErr);
         }
      }

      iterResult = await nextPromise;
      rawBatch = iterResult.value as any[] | undefined;
    }

    // --- FINAL COUNT INSERTION IF NEEDED ---
    if (body.count?.attribute) {
        const attr = body.count.attribute;
        const resultColumn = body.count.resultColumn?.trim() || "conteo";
        const finalRows: Record<string, any>[] = [];
        for (const [key, cnt] of globalCountMap.entries()) {
           finalRows.push({
             [attr]: globalCountOriginalValues.get(key),
             [resultColumn]: cnt
           });
        }
        // Basic sort desc by count
        finalRows.sort((a, b) => (b[resultColumn] || 0) - (a[resultColumn] || 0));
        await insertBatch(finalRows);
    }
    
    // --- COMPLETION ---
    await withRetry(
      () =>
        supabaseAdmin
          .from("etl_runs_log")
          .update({
            status: "completed",
            completed_at: completedAt(),
            rows_processed: rowsProcessed,
          })
          .eq("id", runId)
          .throwOnError(),
      { label: "update-completed" }
    );

    if (body.etlId && !isPreview) {
      try {
        await supabaseAdmin.from("etl").update({ output_table: newTableName } as any).eq("id", body.etlId);
      } catch (_) {}
    }

    console.log(`[Background Run ${runId}] Completed successfully. Rows: ${rowsProcessed}`);
  } catch (err: any) {
    console.error(`[Background Run ${runId}] Fatal Error:`, err);
    try {
      await ensureRunTerminalState(supabaseAdmin, runId, "failed", {
        completed_at: completedAt(),
        error_message: (err?.message || "Error desconocido").slice(0, 500),
        rows_processed: rowsProcessed,
      });
    } catch (logErr) {
      console.error("Failed to log fatal error to DB:", logErr);
    }
  } finally {
    clearTimeout(pipelineTimer);
    if (!pipelineTimedOut) {
      try {
        const { data: row } = await supabaseAdmin
          .from("etl_runs_log")
          .select("status")
          .eq("id", runId)
          .maybeSingle();
        const status = (row as any)?.status;
        if (status === "started" || status === "running") {
          await ensureRunTerminalState(supabaseAdmin, runId, "failed", {
            completed_at: completedAt(),
            error_message: "Ejecución interrumpida o error no registrado",
            rows_processed: rowsProcessed,
          });
        }
      } catch (_) {}
    }
    try { await sqlPersistent.end(); } catch (_) {}
    const elapsedMs = Date.now() - pipelineStartedAt;
    console.log(`[Background Run ${runId}] Finished in ${elapsedMs}ms.`);
  }
}

// ===================================================================
// LÓGICA PRINCIPAL DE LA API ROUTE (FIRE-AND-FORGET)
// ===================================================================
/** Límite Vercel: Hobby 300s, Pro 800s (máx). vercel.json fija 300s para esta ruta; si la ejecución supera ese tiempo, la función puede ser terminada y el run quedará "En progreso". El cron /api/etl/mark-stale-runs-failed (cada 10 min) marca esos runs como fallidos. Para cargas muy grandes, considerar un worker externo. */
export const maxDuration = 800;

export async function POST(req: NextRequest) {
  const runId = uuidv4();
  let runLogInserted = false;
  
  try {
     const body = (await req.json()) as RunBody | null;
     if (!body) throw new Error("Cuerpo vacío");

     const supabaseAdmin = await createClient();
     let user: { id: string } | null = null;
     const cronSecret = req.headers.get("x-cron-secret");
     const validCronSecret =
       process.env.ETL_SCHEDULER_SECRET || process.env.CRON_SECRET;
     if (body.etlId && cronSecret && validCronSecret && cronSecret === validCronSecret) {
       const serviceClient = createServiceRoleClient();
       const { data: etlRow } = await serviceClient.from("etl").select("user_id").eq("id", body.etlId).single();
       if (etlRow?.user_id) user = { id: (etlRow as { user_id: string }).user_id };
     }
     if (!user) {
       const { data: { user: authUser } } = await supabaseAdmin.auth.getUser();
       user = authUser;
     }
     if (!user) throw new Error("No autorizado");

     if (body.etlId) {
       try {
         await markStaleRunsForEtl(supabaseAdmin, body.etlId);
       } catch (cleanupErr) {
         console.warn("[ETL] No se pudieron cerrar runs stale al iniciar:", cleanupErr);
       }
     }

     // 1. Log Initial "started" state
     // We do this BEFORE starting background work to ensure the ID exists for realtime listeners
     // Calculate initial table name (same logic as background, but simple version for log)
     const rawTable = body.end?.target?.table?.trim();
     const cleanTable = rawTable ? rawTable.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() : "";

     await supabaseAdmin
       .from("etl_runs_log")
       .insert({
         id: runId,
         etl_id: body.etlId,
         status: "started",
         destination_schema: "etl_output", 
         destination_table_name: cleanTable,
       })
       .throwOnError();
     runLogInserted = true;

     // Guardar configuración del flujo guiado en el ETL para poder cargarla al editar
     if (body.etlId) {
       try {
         const { data: etlRow } = await supabaseAdmin.from("etl").select("layout").eq("id", body.etlId).single();
         const currentLayout = (etlRow as any)?.layout ?? {};
         const guidedConfig = {
           connectionId: body.connectionId ?? (body.union as any)?.left?.connectionId ?? (body.join as any)?.primaryConnectionId,
           filter: body.filter ?? (body.union as any)?.left?.filter,
           union: body.union,
           join: body.join,
           clean: body.clean,
           end: body.end,
           ...((body as any).schedule != null && { schedule: (body as any).schedule }),
         };
         await supabaseAdmin
           .from("etl")
           .update({ layout: { ...currentLayout, guided_config: guidedConfig } } as any)
           .eq("id", body.etlId);
       } catch (_) {}
     }

      // 2. Run pipeline (síncrono si waitForCompletion, sino fire-and-forget)
      const pipelinePromise = executeEtlPipeline(body, runId, supabaseAdmin, user);

      if (body.waitForCompletion) {
        await pipelinePromise;
        return NextResponse.json({
          ok: true,
          runId,
          completed: true,
          message: "ETL completado. Los datos están listos."
        });
      }

      pipelinePromise.catch(err => console.error("Unhandled background ETL error:", err));
      // Mantener la ejecución del pipeline tras enviar la respuesta (Vercel/Next no corta el proceso)
      const { after } = await import("next/server");
      after(() => pipelinePromise);
      return NextResponse.json({
        ok: true,
        runId,
        message: "Proceso ETL iniciado en segundo plano. Monitoree el progreso vía realtime o logs."
      });

  } catch (err: any) {
     console.error("Error initiating ETL run:", err);
     if (runLogInserted) {
       try {
         const admin = await createServiceRoleClient();
         await ensureRunTerminalState(admin, runId, "failed", {
           completed_at: new Date().toISOString(),
           error_message: (err?.message || "Error al iniciar ETL").slice(0, 500),
         });
       } catch (logErr) {
         console.error("Error marking failed run during initialization:", logErr);
       }
     }
     return NextResponse.json(
        { ok: false, error: err?.message || "Error al iniciar ETL" },
        { status: 500 }
     );
  }
}
