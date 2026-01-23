import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { v4 as uuidv4 } from "uuid";
import { Client as PgClient } from "pg";
import postgres from "postgres"; // Used only for DDL and inserts with postgres.js
import {
  quoteIdent,
  quoteQualified,
  buildWhereClausePg,
  buildWhereClausePgStar,
  buildJoinClauseBinary,
} from "@/lib/sql/helpers";
import {
  applyTransforms,
  applyCastConversions,
  applyArithmeticOperations,
  applyConditionRules,
  getValue,
  CastTargetType
} from "@/lib/etl/transformations";

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
  clean?: {
    transforms: Array<
      | {
          column: string;
          op: "trim" | "upper" | "lower" | "cast_number" | "cast_date";
        }
      | {
          column: string;
          op: "replace";
          find: string;
          replaceWith: string;
        }
    >;
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
      operator: "+" | "-" | "*" | "/" | "%" | "^";
      rightOperand: { type: "column" | "constant"; value: string };
      resultColumn: string;
    }>;
  };
  condition?: {
    rules: Array<{
      id: string;
      // Legacy fields
      column?: string;
      operator?: string;
      value?: string | number | boolean;
      outputValue?: string;
      outputColumn?: string;
      // New fields matching applyConditionRules
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
// LÓGICA DE FONDO (BACKGROUND WORKER)
// ===================================================================

/**
 * Executes the entire ETL pipeline asynchronously.
 * Updates the 'etl_runs_log' table with progress and final status.
 */
async function executeEtlPipeline(
  body: RunBody,
  runId: string,
  supabaseAdmin: any, // Typed as any to avoid conflicts with different client versions
  user: any
) {
  let newTableName = "";

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
      await supabaseAdmin
      .from("etl_runs_log")
      .update({
        destination_schema: "etl_output",
        destination_table_name: newTableName,
        status: "running" // Transition from started to running
      })
      .eq("id", runId);


    // Preview logic removed from background execution as preview is typically synchronous/short
    // but we can keep it if unified. However, 'POST' usually returns preview immediately.
    // Assuming this background function is ONLY for full execution.
    const isPreview = !!body.preview; 
    const previewRows: Record<string, any>[] = [];
    const PREVIEW_LIMIT = 5000;

    let rowsProcessed = 0;
    const pageSize = 5000;
    const INSERT_CHUNK_SIZE = 1000;
    let tableCreated = false;

    // Global count state
    const globalCountMap = new Map<string, number>();
    const globalCountOriginalValues = new Map<string, any>();

    const insertBatch = async (batch: Record<string, any>[]) => {
      if (batch.length === 0) return;

      if (!tableCreated && !isPreview) {
        const firstRow = batch[0];
        const columnsDefinition: Record<string, string> = {};

        // Map explicit cast target types
        const castTypeOverrides: Record<string, string> = {};
        if (body!.cast?.conversions?.length && firstRow) {
          const keys = Object.keys(firstRow);
          const resolveTargets = (simple: string) => {
            const matches = keys.filter(
              (k) => k === simple || k.endsWith(`_${simple}`)
            );
            return matches.length
              ? matches
              : keys.includes(simple)
              ? [simple]
              : [];
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
              const saneKey = key.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
              castTypeOverrides[saneKey] = pgType;
            }
          }
        }

        for (const key in firstRow) {
          const saneKey = key.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
          const overrideType = castTypeOverrides[saneKey];
          columnsDefinition[`"${saneKey}"`] = overrideType || inferPostgresType(firstRow[key]);
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

        const dbUrl = process.env.SUPABASE_DB_URL;
        if (!dbUrl) throw new Error("Variable de entorno SUPABASE_DB_URL no encontrada.");

        const sql = postgres(dbUrl);
        try {
          if (mode === "overwrite" || mode === "replace") {
            const dropQuery = `DROP TABLE IF EXISTS etl_output."${newTableName}" CASCADE;`;
            await sql.unsafe(dropQuery);
          }
          if (mode === "append") {
            const existsRes = await sql.unsafe(
              `SELECT to_regclass('etl_output."${newTableName}"') AS reg`
            );
            const exists = Array.isArray(existsRes) && existsRes[0]?.reg;
            if (exists) {
              tableCreated = true;
            }
          }
          if (!tableCreated) {
            const createTableQuery = `CREATE TABLE etl_output."${newTableName}" (${columnParts.join(", ")});`;
            await sql.unsafe(createTableQuery);
            tableCreated = true;
          }
        } finally {
          await sql.end();
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
               saneRow[saneKey] = row[key];
             }
             if (body?.etlId) saneRow["etl_id"] = body.etlId;
             previewRows.push(saneRow);
          }
        }
        return;
      }

      // --- INSERT TO DB ---
      const batchToInsert = batch.map((row) => {
        const saneRow: Record<string, any> = {};
        for (const key in row) {
          const saneKey = key.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
          saneRow[saneKey] = row[key];
        }
        if (body?.etlId) {
          saneRow["etl_id"] = body.etlId;
        }
        return saneRow;
      });

      const dbUrlInsert = process.env.SUPABASE_DB_URL;
      if (!dbUrlInsert) throw new Error("SUPABASE_DB_URL no encontrada.");
      const sqlInsert = postgres(dbUrlInsert);

      try {
        for (let i = 0; i < batchToInsert.length; i += INSERT_CHUNK_SIZE) {
          const chunk = batchToInsert.slice(i, i + INSERT_CHUNK_SIZE);
          if (chunk.length > 0) {
            await sqlInsert`INSERT INTO etl_output.${sqlInsert(newTableName)} ${sqlInsert(chunk)}`;
          }
        }
      } catch (insErr: any) {
        throw new Error(`Error guardando lote: ${insErr.message}`);
      } finally {
        await sqlInsert.end();
      }
    };

    // --- DATA SOURCE GENERATOR ---
    async function* dataSourceGenerator(): AsyncGenerator<any[], void, void> {
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

      let client: PgClient;
      if (conn.type === "excel_file") {
        const dbUrl = process.env.SUPABASE_DB_URL;
        if (!dbUrl) throw new Error("SUPABASE_DB_URL no disponible.");
        client = new PgClient({ connectionString: dbUrl });
      } else if (conn.type === "postgres" || conn.type === "postgresql") {
        client = new PgClient({
          host: conn.db_host || undefined,
          user: conn.db_user || undefined,
          database: conn.db_name || undefined,
          port: conn.db_port ?? 5432,
        });
      } else {
        throw new Error(`Tipo de conexión no soportado: ${conn.type}.`);
      }

      await client.connect();

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
              const mappedConds = (body!.filter?.conditions || []).map((c) => {
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
                 const { clause, params } = buildWhereClausePg(mappedConds);
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
                 const { clause, params } = buildWhereClausePg(mappedConds);
                 baseQuery = `SELECT ${selectParts.join(", ")} FROM ${lQ} AS l ${joinClause} ${clause}`;
                 queryParams = params;
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
                 if (arr.length) joinsSelected[jn.id] = arr;
               });

               if (dbType === "excel_file") {
                  const internalClient = new PgClient({ connectionString: process.env.SUPABASE_DB_URL });
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
                     (star.joins||[]).forEach((jn: any, idx: number) => {
                        const secCols = joinsSelected[jn.id] || jn.secondaryColumns || [];
                        if (secCols.length) secCols.forEach((col: string) => selectParts.push(`j${idx}.${quoteIdent(col)} AS "join_${idx}_${col.replace(/"/g, '""')}"`));
                        else selectParts.push(`j${idx}.*`);
                     });

                     let fromJoin = `FROM ${pQ} AS p`;
                     (star.joins||[]).forEach((jn: any, idx: number) => {
                        const jt = (jn.joinType || "INNER").toUpperCase();
                        const on = `p.${quoteIdent(jn.primaryColumn||"")} = j${idx}.${quoteIdent(jn.secondaryColumn||"")}`;
                        fromJoin += ` ${jt} JOIN ${jQs[idx]} AS j${idx} ON ${on}`;
                     });
                     
                     const { clause, params } = buildWhereClausePgStar(body!.filter?.conditions || [], (star.joins||[]).length);
                     baseQuery = `SELECT ${selectParts.join(", ")} ${fromJoin} ${clause} ORDER BY 1 ASC`;
                     queryParams = params;
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
                  (star.joins||[]).forEach((jn: any, idx: number) => {
                      const secCols = joinsSelected[jn.id] || jn.secondaryColumns || [];
                      if (secCols.length) secCols.forEach((col: string) => selectParts.push(`j${idx}.${quoteIdent(col)} AS "join_${idx}_${col.replace(/"/g, '""')}"`));
                      else selectParts.push(`j${idx}.*`);
                  });

                  let fromJoin = `FROM ${pQ} AS p`;
                  (star.joins||[]).forEach((jn: any, idx: number) => {
                      const jt = (jn.joinType || "INNER").toUpperCase();
                      const on = `p.${quoteIdent(jn.primaryColumn||"")} = j${idx}.${quoteIdent(jn.secondaryColumn||"")}`;
                      fromJoin += ` ${jt} JOIN ${jQs[idx]} AS j${idx} ON ${on}`;
                  });
                   
                  const { clause, params } = buildWhereClausePgStar(body!.filter?.conditions || [], (star.joins||[]).length);
                  baseQuery = `SELECT ${selectParts.join(", ")} ${fromJoin} ${clause}`;
                  queryParams = params;
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
           
           const { columns, conditions } = body!.filter!;
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
           
           const { clause, params } = buildWhereClausePg(conditions);
           baseQuery = `SELECT ${selectList} FROM ${tableQ} ${clause} ORDER BY 1 ASC`;
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

    // --- MAIN EXECUTION LOOP ---
    for await (const rawBatch of dataSourceGenerator()) {
      if (rawBatch.length === 0) continue;
      rowsProcessed += rawBatch.length;
      console.log(`[Background Run ${runId}] Processing batch of ${rawBatch.length} rows`);

      let transformedBatch = rawBatch;
      if (body.pipeline?.length) {
         for (const step of body.pipeline) {
            try {
               switch (step.type) {
                  case "clean": transformedBatch = transformedBatch.map(r => applyTransforms(r, step.config)); break;
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
         transformedBatch = rawBatch.map(r => applyTransforms(r, body?.clean));
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
         continue;
      }

      if (transformedBatch.length === 0) continue;
      
      await insertBatch(transformedBatch);

      // --- REALTIME UPDATE UPDATE ---
      try {
         await supabaseAdmin
           .from("etl_runs_log")
           .update({ rows_processed: rowsProcessed })
           .eq("id", runId);
      } catch (logErr) {
         console.warn("[Background] Log update failed (non-fatal):", logErr);
      }
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
    await supabaseAdmin
       .from("etl_runs_log")
       .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          rows_processed: rowsProcessed
       })
       .eq("id", runId)
       .throwOnError();
    
    // Update ETL definition output table link
    if (body.etlId && !isPreview) {
       await supabaseAdmin.from("etl").update({ output_table: newTableName } as any).eq("id", body.etlId);
    }
    
    console.log(`[Background Run ${runId}] Completed successfully. Rows: ${rowsProcessed}`);

  } catch (err: any) {
    console.error(`[Background Run ${runId}] Fatal Error:`, err);
    try {
       await supabaseAdmin
         .from("etl_runs_log")
         .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: err.message || "Unknown error"
         })
         .eq("id", runId);
    } catch (logErr) {
        console.error("Failed to log fatal error to DB:", logErr);
    }
  }
}

// ===================================================================
// LÓGICA PRINCIPAL DE LA API ROUTE (FIRE-AND-FORGET)
// ===================================================================
export async function POST(req: NextRequest) {
  const runId = uuidv4();
  
  try {
     const body = (await req.json()) as RunBody | null;
     if (!body) throw new Error("Cuerpo vacío");

     const supabaseAdmin = await createClient();
     const { data: { user } } = await supabaseAdmin.auth.getUser();
     if (!user) throw new Error("No autorizado");

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

      // 2. Start Background Process (Fire-and-Forget)
      // Note: In Next.js App Router (Node runtime), we can just not await.
      // If deployed on Vercel Serverless, 'waitUntil' from @vercel/functions is recommended 
      // but standard promise floating often works for short tasks or if configuring function duration.
      // Since this is a long running task, "waitUntil" is safer if available, but for now we rely on standard behavior.
      const backgroundPromise = executeEtlPipeline(body, runId, supabaseAdmin, user);
      
      // We attach a catch handler to prevent unhandled rejections crashing the process
      backgroundPromise.catch(err => console.error("Unhandled background ETL error:", err));
    
      // 3. Return immediately
      return NextResponse.json({
        ok: true,
        runId,
        message: "Proceso ETL iniciado en segundo plano. Monitoree el progreso vía realtime o logs."
      });

  } catch (err: any) {
     console.error("Error initiating ETL run:", err);
     return NextResponse.json(
        { ok: false, error: err?.message || "Error al iniciar ETL" },
        { status: 500 }
     );
  }
}
