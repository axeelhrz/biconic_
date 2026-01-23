import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Client as PgClient } from "pg";
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
  applyCountAggregation,
  CastTargetType
} from "@/lib/etl/transformations";

// Reuse types from run/route.ts (duplicated here for independence)
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
};

















// Helpers imported from @/lib/etl/transformations

export async function POST(req: NextRequest) {
  let body: RunBody | null = null;
  const PREVIEW_LIMIT = 1000;

  try {
    body = (await req.json()) as RunBody | null;
    if (!body) throw new Error("Cuerpo vacío");

    const supabaseAdmin = await createClient();
    const {
      data: { user },
    } = await supabaseAdmin.auth.getUser();
    if (!user) throw new Error("No autorizado");

    // Generator restricted to a HARD LIMIT of 1000 rows
    async function* dataSourceGenerator() {
      if (!body) return;

      const filter = body.filter;
      const joinConf = body.join;

        // Helper shared for both Join and Single connection flows
        const getPasswordFromSecret = async (secretId: string | null) => {
            if (!secretId) return null;
            return process.env.DB_PASSWORD_PLACEHOLDER || "tu-contraseña-secreta";
        };

        if (joinConf?.connectionId) {
          const primaryConnId = joinConf.connectionId;
          const secondaryConnId = joinConf.secondaryConnectionId;

          const { data: conn1 } = await supabaseAdmin
            .from("connections")
            .select("*")
            .eq("id", primaryConnId)
            .single();

          const { data: conn2 } = await supabaseAdmin
            .from("connections")
            .select("*")
            .eq("id", secondaryConnId || "")
            .single();

          if (!conn1 || !conn2) return;

          const pwd1 = await getPasswordFromSecret(conn1.db_password_secret_id);
          const dbUrl1 = `postgres://${conn1.db_user}:${pwd1}@${conn1.db_host}:${conn1.db_port}/${conn1.db_name}?sslmode=require`;
          
          const client1 = new PgClient({ connectionString: dbUrl1 });
          await client1.connect();

          try {
            const { leftTable, rightTable } = joinConf;
            const lQ = quoteQualified(leftTable);
            const rQ = quoteQualified(rightTable);

            // Build Select
            const selectParts: string[] = [];
            if (joinConf.leftColumns?.length) {
              joinConf.leftColumns.forEach((col: string) =>
                selectParts.push(`l.${quoteIdent(col)} AS "primary_${col.replace(/"/g, '""')}"`)
              );
            } else {
              selectParts.push("l.*");
            }

            if (joinConf.rightColumns?.length) {
              joinConf.rightColumns.forEach((col: string) =>
                selectParts.push(`r.${quoteIdent(col)} AS "join_0_${col.replace(/"/g, '""')}"`)
              );
            } else {
               selectParts.push("r.*");
            }

            const joinClause = buildJoinClauseBinary(
              joinConf.joinConditions || [],
              "postgres",
              rQ
            );

            // Map filter conditions (primary. -> left., join_0. -> right.)
            const mappedConds = (body.filter?.conditions || []).map((c) => {
               const col = c.column || "";
               let mapped = col.replace(/^primary\./i, "left."); // or l.
               mapped = mapped.replace(/^join_0\./i, "right.");   // or r.
               // Helper expects l. or r. prefixes for binary logic
               return { ...c, column: mapped } as any;
            });

            const { clause: whereClause, params } = buildWhereClausePg(mappedConds);

            const baseQuery = `SELECT ${selectParts.join(", ")} FROM ${lQ} AS l ${joinClause} ${whereClause}`;

            // STRICT LIMIT for preview with deterministic ordering
            const limitQuery = `${baseQuery} ORDER BY 1 ASC LIMIT ${PREVIEW_LIMIT}`;
            
            const res = await client1.query(limitQuery, params);
            if (res.rows.length) yield { rows: res.rows, query: baseQuery };
          } finally {
            await client1.end();
          }

        } else if (body.connectionId) {
          const { data: conn, error: connError } = await supabaseAdmin
            .from("connections")
            .select("*")
            .eq("id", body.connectionId)
            .single();
          
          if (conn) {
               console.log("[Preview] Connection found:", conn.id);
          }
          
          if (connError) console.error("[Preview] Connection fetch error:", connError);
  
          if (!conn) throw new Error(`Conexión no encontrada: ${body.connectionId}`);

        let dbUrl: string;
        let tableToQuery = body.filter?.table;

        if (conn.type === "excel_file") {
            console.log("[Preview] Detected Excel connection. Fetching metadata...");
            // Lógica para Excel (similar a run/route.ts)
            const { data: meta } = await supabaseAdmin
              .from("data_tables")
              .select("physical_schema_name, physical_table_name")
              .eq("connection_id", conn.id)
              .single();
            
            console.log("[Preview] Excel metadata:", meta);

            if (!meta || !meta.physical_table_name) {
                 throw new Error(`No se encontraron metadatos de tabla física para la conexión de Excel ID ${conn.id}.`);
            }
            const schema = meta.physical_schema_name || "excel_imports";
            // Sobreescribimos la tabla a consultar con la física interna
            tableToQuery = `${schema}.${meta.physical_table_name}`;
            console.log("[Preview] Table to query:", tableToQuery);
            
            const internalDbUrl = process.env.SUPABASE_DB_URL;
            if (!internalDbUrl) throw new Error("Variable de entorno SUPABASE_DB_URL no encontrada para conexión interna.");
            dbUrl = internalDbUrl;

        } else {
            // Lógica para Postgres externo
            // getPasswordFromSecret moved to top of scope

            const password = await getPasswordFromSecret(conn.db_password_secret_id);
            
            const dbConfig = {
                host: conn.db_host,
                user: conn.db_user,
                password: password,
                port: conn.db_port,
                database: conn.db_name
            };

            if (!dbConfig.host || !dbConfig.user || !dbConfig.database) {
                 throw new Error(`Configuración de conexión incompleta para ID: ${body.connectionId}`);
            }

            dbUrl = `postgres://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}?sslmode=require`;
        }
        const client = new PgClient({ connectionString: dbUrl });
        await client.connect();

        try {
          let baseQuery = "";
          let queryParams: any[] = [];
          
          if (tableToQuery) {
            const tableQ = quoteQualified(tableToQuery);
            const columns = filter?.columns;
            const conditions = filter?.conditions || [];

            const selectList =
              columns && columns.length
                ? columns.map((c) => quoteIdent(c)).join(", ")
                : "*";

            const { clause: whereClause, params } = buildWhereClausePg(conditions);
            
            // Fix: Add deterministic ordering for stable pagination
            // We use ORDER BY 1 (first column) as a generic fallback if no PK known
            baseQuery = `SELECT ${selectList} FROM ${tableQ} ${whereClause} ORDER BY 1 ASC`;
            queryParams = params;
          } else {
             // Fallback if generic query needed (should not happen if flow is correct)
             console.error("[Preview] No table specified for query.");
             return; 
          }

          // Chunked fetching strategy
          const BATCH_SIZE = 5000;
          const MAX_SCAN_LIMIT = 100000; // Scan up to 100k rows to find matches
          let offset = 0;
          let totalFixedScanned = 0;

          while (totalFixedScanned < MAX_SCAN_LIMIT) {
              const pagedQuery = `${baseQuery} LIMIT ${BATCH_SIZE} OFFSET ${offset}`;
              const res = await client.query(pagedQuery, queryParams);
              const batchSize = res.rows.length;
              
              if (batchSize === 0) break; // End of table

              yield { rows: res.rows, query: baseQuery }; // Return baseQuery to show user the logic, or pagedQuery? Base is cleaner.
              
              offset += batchSize;
              totalFixedScanned += batchSize;
              
              // If we fetched less than requested, we reached the end
              if (batchSize < BATCH_SIZE) break;
          }

        } finally {
          await client.end();
        }
      }
    }

    const allPreviewRows: Record<string, any>[] = [];

    let finalExtractionQuery = "";
    const transformationSteps: string[] = [];

    let isFirstBatch = true;

    // Collect Data
    for await (const { rows: rawBatch, query } of dataSourceGenerator()) {
      if (!finalExtractionQuery) finalExtractionQuery = query;
      
      if (rawBatch.length === 0) continue;

      try {
        let transformedBatch = rawBatch;

        if (isFirstBatch) {
             const tableName = body.join ? "Multi-Table Join" : (body.filter?.table || "Source Table");
             transformationSteps.push(`Source (SQL): Extracted data from ${tableName}`);
             
             if (body.filter?.conditions?.length) {
                 body.filter.conditions.forEach((cond: any) => {
                     transformationSteps.push(`SQL Filter: ${cond.column} ${cond.operator} ${cond.value || ''}`);
                 });
             }
        }

        if (body.pipeline?.length) {
          // --- SEQUENTIAL PIPELINE EXECUTION ---
          for (const step of body.pipeline) {
             try {
               switch (step.type) {
                 case "clean":
                   transformedBatch = transformedBatch.map((row) =>
                      applyTransforms(row, step.config)
                   );
                   if (isFirstBatch && !transformationSteps.includes("Clean (Trim/Format)")) transformationSteps.push("Clean (Trim/Format)");
                   break;

                 case "cast":
                   transformedBatch = applyCastConversions(transformedBatch, step.config);
                   // Log
                   if (isFirstBatch) {
                      const prefixCast = "Cast:";
                      const conversions = step.config?.conversions || [];
                      conversions.forEach((c: any) => {
                          transformationSteps.push(`${prefixCast} ${c.column} -> ${c.toType}`);
                      });
                   }
                   break;

                 case "arithmetic":
                   transformedBatch = applyArithmeticOperations(transformedBatch, step.config);
                   // Log
                   if (isFirstBatch) {
                      const prefixArith = "Arithmetic:";
                      const ops = step.config?.operations || [];
                      ops.forEach((op: any) => {
                          const left = typeof op.leftOperand === 'object' ? op.leftOperand.value : (op.leftOperand || op.leftColumn);
                          const right = typeof op.rightOperand === 'object' ? op.rightOperand.value : (op.rightOperand || op.rightColumn);
                          const desc = `${prefixArith} ${op.resultColumn} = ${left} ${op.operator} ${right}`;
                          transformationSteps.push(desc);
                      });
                   }
                   break;

                 case "condition":
                   transformedBatch = applyConditionRules(transformedBatch, step.config);
                   // Log
                   const prefixCond = "Condition #";
                   // Since we might have multiple condition nodes, we can't just check prefix match globally or we miss subsequent nodes.
                   // We should log if *this specific step* hasn't been logged. 
                   // But preview runs in chunks. simpler is to store logged step IDs? 
                   // Or just check if transformationSteps already contains logs for *this* step?
                   // For now, I'll allow duplicates in the list if the user has multiple condition nodes, 
                   // BUT avoid duplicates PER BATCH.
                   // Checking `transformationSteps` length logic is tricky if we stream.
                   // Actually `transformationSteps` is accumulated for the whole request reference (const outside generator).
                   // So if we have Condition Node A and Condition Node B, we want logs for A and B.
                   // But processing Batch 1 -> Logs A, B. Batch 2 -> Should NOT log A, B again.
                   // The simple `filter` check prevents repeating "Condition #1" if it's already there.
                   // To differentiate Node A vs Node B, we need unique IDs in logs or just append?
                   // Given the user wants to see "Condition #1, #2, #3", maybe just APPENDING is better, 
                   // but guard against Batch 2 appending again.
                   // Solution: Only log transformations for the FIRST batch.
                   // `allPreviewRows.length === 0` (before push) check? 
                   // `transformationSteps` is empty initially.
                   // The check `filter(...).length === 0` prevents duplicates.
                   // But if I have 2 condition nodes in pipeline, both will try "Condition #1" if I reset index?
                   // I should use the step index in pipeline or generate a unique label?
                   // "Step N (Condition): ..."
                   
                   // Let's stick to the prefix check but make it specific to the batch?
                   // No, use a global "loggedSteps" set? 
                   // Refactor: Just wrap logging in `if (allPreviewRows.length === 0)` 
                   // (Validation: `allPreviewRows` is populated at the END of the batch processing. So for the first batch, it is empty.)
                   
                   if (isFirstBatch) {
                      const rules = step.config?.rules || [];
                      rules.forEach((rule: any, idx: number) => {
                          const action = rule.shouldFilter ? "FILTER REMOVE" : (rule.outputType ? `SET ${rule.resultColumn}` : "CHECK");
                          const left = rule.leftOperand?.value || rule.leftOperand;
                          const right = rule.rightOperand?.value || rule.rightOperand;
                          const op = rule.comparator || rule.operator || "=";
                          
                          const desc = `Condition (Step): IF ${left} ${op} ${right} THEN ${action}`;
                          transformationSteps.push(desc);
                      });
                   }
                   break;
               }
             } catch(e: any) {
                console.error(`[Preview Pipeline Error] Step ${step.type} failed:`, e);
                throw new Error(`Error en paso ${step.type}: ${e.message}`);
             }
          }

        } else {
            // --- LEGACY FIXED ORDER EXECUTION ---
            
            // 1. Clean
            transformedBatch = rawBatch.map((row) =>
              applyTransforms(row, body?.clean)
            );
            if (!transformationSteps.includes("Clean (Trim/Format)")) transformationSteps.push("Clean (Trim/Format)");

            // 2. Cast
            if (body.cast?.conversions?.length) {
              try {
                  transformedBatch = applyCastConversions(transformedBatch, body.cast);
                  // Granular logging for Cast
                  const prefix = "Cast:";
                  if (transformationSteps.filter(s => s.startsWith(prefix)).length === 0) {
                     body.cast.conversions.forEach((c: any) => {
                         transformationSteps.push(`${prefix} ${c.column} -> ${c.toType}`);
                     });
                  }
              } catch (e: any) {
                  console.error("[Preview Error] Cast failed:", e);
                  throw new Error(`Error en conversión de tipos: ${e.message}`);
              }
            }

            // 3. Arithmetic
            if (body.arithmetic?.operations?.length) {
              try {
                 transformedBatch = applyArithmeticOperations(
                    transformedBatch,
                    body.arithmetic
                 );
                 // Granular logging for Arithmetic
                 const prefix = "Arithmetic:";
                 if (transformationSteps.filter(s => s.startsWith(prefix)).length === 0) {
                    body.arithmetic.operations.forEach((op: any) => {
                        const left = typeof op.leftOperand === 'object' ? op.leftOperand.value : (op.leftOperand || op.leftColumn);
                        const right = typeof op.rightOperand === 'object' ? op.rightOperand.value : (op.rightOperand || op.rightColumn);
                        const desc = `${prefix} ${op.resultColumn} = ${left} ${op.operator} ${right}`;
                        transformationSteps.push(desc);
                    });
                 }
              } catch (e: any) {
                 console.error("[Preview Error] Arithmetic failed:", e);
                 throw new Error(`Error en operaciones aritméticas: ${e.message}`);
              }
            }
            
            // 4. Condition
            if (body.condition?.rules?.length) {
              try {
                  transformedBatch = applyConditionRules(
                    transformedBatch,
                    body.condition
                  );
                  // Granular logging for Condition
                  const prefix = "Condition #";
                  if (transformationSteps.filter(s => s.startsWith(prefix)).length === 0) {
                     body.condition.rules.forEach((rule: any, idx: number) => {
                         const action = rule.shouldFilter ? "FILTER REMOVE" : (rule.outputType ? `SET ${rule.resultColumn}` : "CHECK");
                         const left = rule.leftOperand?.value || rule.leftOperand;
                         const right = rule.rightOperand?.value || rule.rightOperand;
                         const op = rule.comparator || rule.operator || "=";
                         
                         const desc = `${prefix}${idx+1}: IF ${left} ${op} ${right} THEN ${action}`;
                         transformationSteps.push(desc);
                     });
                  }
              } catch (e: any) {
                  console.error("[Preview Error] Condition failed:", e);
                  throw new Error(`Error en condiciones: ${e.message}`);
              }
            }
        } // End Legacy Else

        // Count (Always last? Or should it be in pipeline?)
        // For now keep it outside as implicit final step, but usually Aggregation is a separate node type.
        // Editors might treat Count as a property of End node or a separate Widget.
        // Existing code checks body.count.
        
        if (body.count?.attribute) {
           try {
               transformedBatch = applyCountAggregation(transformedBatch, body.count);
               if (!transformationSteps.includes("Count Aggregation")) transformationSteps.push("Count Aggregation");
           } catch (e: any) {
               console.error("[Preview Error] Count failed:", e);
               throw new Error(`Error en agregación (Count): ${e.message}`);
           }
        }
        
        if (transformedBatch.length) {
            allPreviewRows.push(...transformedBatch);
        }
      } catch (err: any) {
         console.error("[Preview Error] Batch processing failed:", err);
         throw err; 
      } finally {
        isFirstBatch = false;
      }
      
      // Stop if we hit the limit (already limited by SQL but good safety)
      if (allPreviewRows.length >= PREVIEW_LIMIT) break;
    }

    return NextResponse.json({
      ok: true,
      rowsProcessed: allPreviewRows.length,
      previewRows: allPreviewRows,
      destinationTable: "(Vista Previa)",
      extractionQuery: finalExtractionQuery,
      transformationSteps
    });

  } catch (err: any) {
    console.error("Error en Preview:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Error generando vista previa" },
      { status: 500 }
    );
  }
}
