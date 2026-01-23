import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import * as ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import {
  quoteIdent,
  quoteQualified,
  buildWhereClausePg,
  buildWhereClauseMy,
  buildWhereClausePgStar,
  buildWhereClauseMyStar,
  buildJoinClauseBinary,
} from "@/lib/sql/helpers";
// Using inline mapped types instead of type import to avoid conflicts with previous local declarations during refactor
type FilterCondition = import("@/lib/sql/helpers").FilterCondition;
type JoinCondition = import("@/lib/sql/helpers").JoinCondition;

// removed duplicate local declaration (now above)

// Single-table payload
type SinglePayload = {
  connectionId?: string | number;
  type?: "mysql" | "postgres" | "postgresql" | "excel";
  host?: string;
  database?: string;
  user?: string;
  password?: string;
  port?: number;
  ssl?: boolean;
  table?: string; // schema.table
  columns?: string[];
  conditions?: FilterCondition[];
};

// Join payload
// removed duplicate local declaration (now above)

type JoinPayload = {
  connectionId?: string | number; // left
  type?: "mysql" | "postgres" | "postgresql";
  host?: string;
  database?: string;
  user?: string;
  password?: string;
  port?: number;
  ssl?: boolean;

  secondaryConnectionId?: string | number; // right
  secondaryType?: "mysql" | "postgres" | "postgresql";
  secondaryHost?: string;
  secondaryDatabase?: string;
  secondaryUser?: string;
  secondaryPassword?: string;
  secondaryPort?: number;
  secondarySsl?: boolean;

  leftTable?: string; // schema.table
  rightTable?: string; // schema.table
  joinConditions?: JoinCondition[];
  leftColumns?: string[]; // optional projection
  rightColumns?: string[];
  conditions?: FilterCondition[]; // may include left./right. qualifiers
};

// Replaced local helpers with shared helpers imports

const toExcelBuffer = async (
  rowsIter: AsyncGenerator<any[], void, void>,
  headerKeys?: string[],
  headerLabels?: string[]
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Datos");

  let headers: string[] = headerKeys || [];
  let wroteHeader = false;
  const tableRows: any[][] = [];

  for await (const batch of rowsIter) {
    if (batch.length === 0) continue;
    if (!wroteHeader) {
      // Determine headers from first row if not provided
      if (headers.length === 0) headers = Object.keys(batch[0] || {});
      // Set header row visibly
      ws.addRow(headers.map((h, i) => (headerLabels && headerLabels[i]) || h));
      wroteHeader = true;
    }
    for (const r of batch) {
      const arr = headers.map((k) => r[k]);
      tableRows.push(arr);
      ws.addRow(arr);
    }
  }

  if (wroteHeader) {
    ws.addTable({
      name: "TablaDatos",
      ref: `A1`,
      columns: headers.map((h, i) => ({
        name: (headerLabels && headerLabels[i]) || h,
      })),
      rows: tableRows,
      style: { theme: "TableStyleMedium2", showRowStripes: true },
    });
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf as any);
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as (SinglePayload & JoinPayload) | null;
    if (!body)
      return NextResponse.json(
        { ok: false, error: "Cuerpo vacío" },
        { status: 400 }
      );

    // Auth
    const supabase = await createClient();
    const {
      data: { user: currentUser },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !currentUser)
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );

    const isBinaryJoin =
      Array.isArray((body as any).joinConditions) &&
      (body as any).leftTable &&
      (body as any).rightTable;
    const isStarJoin =
      (body as any).primaryTable && Array.isArray((body as any).joins);

    // Load primary/secondary connection metadata if provided, detect excel
    let {
      connectionId,
      type,
      host,
      database,
      user,
      password,
      port,
      ssl,
      secondaryConnectionId,
      secondaryType,
      secondaryHost,
      secondaryDatabase,
      secondaryUser,
      secondaryPassword,
      secondaryPort,
      secondarySsl,
    } = body as any;

    if (connectionId != null) {
      const { data: conn, error: connError } = await supabase
        .from("connections")
        .select("id, user_id, type, db_host, db_name, db_user, db_port")
        .eq("id", String(connectionId))
        .maybeSingle();
      if (connError || !conn)
        return NextResponse.json(
          {
            ok: false,
            error: connError?.message || "Conexión primaria no encontrada",
          },
          { status: 404 }
        );
      host = (conn as any)?.db_host ?? host;
      database = (conn as any)?.db_name ?? database;
      user = (conn as any)?.db_user ?? user;
      port = (conn as any)?.db_port ?? port;
      if (
        (conn as any)?.type === "excel_file" ||
        (conn as any)?.type === "excel"
      )
        type = "excel" as any;
    }

    if (secondaryConnectionId != null) {
      const { data: conn, error: connError } = await supabase
        .from("connections")
        .select("id, user_id, type, db_host, db_name, db_user, db_port")
        .eq("id", String(secondaryConnectionId))
        .maybeSingle();
      if (connError || !conn)
        return NextResponse.json(
          {
            ok: false,
            error: connError?.message || "Conexión secundaria no encontrada",
          },
          { status: 404 }
        );
      secondaryHost = (conn as any)?.db_host ?? secondaryHost;
      secondaryDatabase = (conn as any)?.db_name ?? secondaryDatabase;
      secondaryUser = (conn as any)?.db_user ?? secondaryUser;
      secondaryPort = (conn as any)?.db_port ?? secondaryPort;
      if (
        (conn as any)?.type === "excel_file" ||
        (conn as any)?.type === "excel"
      )
        secondaryType = "excel" as any;
    }

    // STAR JOIN path (nueva forma)
    if (isStarJoin) {
      const supabase = await createClient(); // reutilizar auth ya existente
      const {
        primaryConnectionId,
        primaryTable,
        joins,
        primaryColumns,
        conditions,
        ssl,
      } = body as any;
      if (!primaryConnectionId || !primaryTable || !joins?.length) {
        return NextResponse.json(
          { ok: false, error: "Configuración de JOIN (star) incompleta" },
          { status: 400 }
        );
      }

      // Cargar metadatos de conexiones involucradas
      const allConnIds = [
        primaryConnectionId,
        ...joins.map((j: any) => j.secondaryConnectionId),
      ].filter((x) => x != null);
      const uniqueConnIds = [...new Set(allConnIds)];
      const connResults = await Promise.all(
        uniqueConnIds.map((id) =>
          supabase
            .from("connections")
            .select("id,type,db_host,db_name,db_user,db_port")
            .eq("id", String(id))
            .eq("user_id", currentUser.id)
            .single()
        )
      );
      const connectionsMap = new Map<string, any>();
      for (const r of connResults) {
        if (r.error || !r.data)
          return NextResponse.json(
            { ok: false, error: "Conexión requerida no encontrada" },
            { status: 404 }
          );
        connectionsMap.set(String(r.data.id), r.data);
      }
      const primaryConn = connectionsMap.get(String(primaryConnectionId));
      if (!primaryConn)
        return NextResponse.json(
          { ok: false, error: "Conexión principal no encontrada" },
          { status: 404 }
        );

      const dbType = (primaryConn.type || "postgres").toLowerCase();

      // Helpers específicos star
      const buildWhereClausePgStar = (
        conds: FilterCondition[],
        joinsCount: number
      ) => {
        const params: any[] = [];
        const parts = conds.map((c) => {
          let col: string;
          const raw = c.column || "";
          const mPrimary = raw.match(/^primary\.(.+)$/i);
          const mJoin = raw.match(/^join_(\d+)\.(.+)$/i);
          if (mPrimary) col = `p.${quoteIdent(mPrimary[1], "postgres")}`;
          else if (mJoin) {
            const idx = Number(mJoin[1]);
            const name = mJoin[2];
            if (Number.isNaN(idx) || idx < 0 || idx >= joinsCount)
              col = quoteIdent(raw, "postgres");
            else col = `j${idx}.${quoteIdent(name, "postgres")}`;
          } else col = quoteIdent(raw, "postgres");
          switch (c.operator) {
            case "is null":
              return `${col} IS NULL`;
            case "is not null":
              return `${col} IS NOT NULL`;
            case "contains":
              params.push(`%${c.value ?? ""}%`);
              return `${col} ILIKE $${params.length}`;
            case "startsWith":
              params.push(`${c.value ?? ""}%`);
              return `${col} ILIKE $${params.length}`;
            case "endsWith":
              params.push(`%${c.value ?? ""}`);
              return `${col} ILIKE $${params.length}`;
            case "in": {
              const list = (c.value ?? "").split(",").map((v) => v.trim());
              const idxs = list.map((v) => {
                params.push(v);
                return `$${params.length}`;
              });
              return `${col} IN (${idxs.join(", ")})`;
            }
            case "not in": {
              const list = (c.value ?? "").split(",").map((v) => v.trim());
              const idxs = list.map((v) => {
                params.push(v);
                return `$${params.length}`;
              });
              return `${col} NOT IN (${idxs.join(", ")})`;
            }
            default: {
              params.push(c.value ?? null);
              return `${col} ${c.operator} $${params.length}`;
            }
          }
        });
        const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
        return { clause, params };
      };

      if (dbType === "excel_file" || dbType === "excel") {
        const dbUrl = process.env.SUPABASE_DB_URL;
        if (!dbUrl)
          return NextResponse.json(
            { ok: false, error: "SUPABASE_DB_URL no configurada" },
            { status: 500 }
          );
        const client = new PgClient({ connectionString: dbUrl });
        try {
          await client.connect();

          // Resolver nombres físicos
          const resolvePhysical = async (connId: any) => {
            const { data: meta, error: mErr } = await supabase
              .from("data_tables")
              .select("physical_schema_name, physical_table_name")
              .eq("connection_id", String(connId))
              .single();
            if (mErr || !meta)
              throw new Error(
                `Metadatos físicos no encontrados para conexión ${connId}`
              );
            return `${meta.physical_schema_name || "data_warehouse"}.${
              meta.physical_table_name
            }`;
          };
          const pPhysical = await resolvePhysical(primaryConnectionId);
          const jPhysicals = await Promise.all(
            joins.map((jn: any) => resolvePhysical(jn.secondaryConnectionId))
          );
          const pQualified = quoteQualified(pPhysical, "postgres");
          const jQualified = jPhysicals.map((q) =>
            quoteQualified(q, "postgres")
          );

          const selectParts: string[] = [];
          if (primaryColumns && primaryColumns.length > 0)
            primaryColumns.forEach((col: string) =>
              selectParts.push(
                `p.${quoteIdent(col, "postgres")} AS ${quoteIdent(
                  `primary_${col}`,
                  "postgres"
                )}`
              )
            );
          else selectParts.push("p.*");
          joins.forEach((jn: any, idx: number) => {
            if (jn.secondaryColumns && jn.secondaryColumns.length > 0)
              jn.secondaryColumns.forEach((col: string) =>
                selectParts.push(
                  `j${idx}.${quoteIdent(col, "postgres")} AS ${quoteIdent(
                    `join_${idx}_${col}`,
                    "postgres"
                  )}`
                )
              );
            else selectParts.push(`j${idx}.*`);
          });

          let fromJoin = `FROM ${pQualified} AS p`;
          joins.forEach((jn: any, idx: number) => {
            const jt = (jn.joinType || "INNER").toUpperCase();
            const on = `p.${quoteIdent(
              jn.primaryColumn || "",
              "postgres"
            )} = j${idx}.${quoteIdent(jn.secondaryColumn || "", "postgres")}`;
            fromJoin += ` ${jt} JOIN ${jQualified[idx]} AS j${idx} ON ${on}`;
          });

          const { clause, params } = buildWhereClausePgStar(
            conditions || [],
            joins.length
          );

          const batchSize = 5000;
          async function* generator() {
            let offset = 0;
            for (;;) {
              const sql = `SELECT ${selectParts.join(
                ", "
              )} ${fromJoin} ${clause} LIMIT $${params.length + 1} OFFSET $${
                params.length + 2
              }`;
              const res = await client.query(sql, [
                ...params,
                batchSize,
                offset,
              ]);
              const rows = res.rows || [];
              if (rows.length === 0) break;
              yield rows;
              if (rows.length < batchSize) break;
              offset += batchSize;
            }
            await client.end();
          }
          const headerKeys = [
            ...(primaryColumns || []).map((c: string) => `primary_${c}`),
            ...joins.flatMap((jn: any, idx: number) =>
              (jn.secondaryColumns || []).map((c: string) => `join_${idx}_${c}`)
            ),
          ];
          const buffer = await toExcelBuffer(generator(), headerKeys);
          const ab = buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
          );
          return new NextResponse(ab as any, {
            status: 200,
            headers: {
              "Content-Type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": `attachment; filename="filtro_join.xlsx"`,
            },
          });
        } catch (e: any) {
          return NextResponse.json(
            { ok: false, error: e.message || "Error exportando Excel" },
            { status: 500 }
          );
        }
      }

      if (dbType === "postgres" || dbType === "postgresql") {
        // Export star para PostgreSQL externo
        const password = (body as any).password;
        if (!password)
          return NextResponse.json(
            { ok: false, error: "Se requiere contraseña para PostgreSQL" },
            { status: 400 }
          );
        const client = new PgClient({
          host: primaryConn.db_host,
          user: primaryConn.db_user,
          database: primaryConn.db_name,
          port: primaryConn.db_port || 5432,
          password,
          connectionTimeoutMillis: 8000,
          ssl: ssl ? { rejectUnauthorized: false } : undefined,
        } as any);
        try {
          await client.connect();
          const pQualified = quoteQualified(primaryTable as string, "postgres");
          const jQualified = (joins as any[]).map((jn) =>
            quoteQualified(jn.secondaryTable || "", "postgres")
          );
          const selectParts: string[] = [];
          if (primaryColumns && primaryColumns.length > 0)
            primaryColumns.forEach((col: string) =>
              selectParts.push(
                `p.${quoteIdent(col, "postgres")} AS ${quoteIdent(
                  `primary_${col}`,
                  "postgres"
                )}`
              )
            );
          else selectParts.push("p.*");
          (joins as any[]).forEach((jn: any, idx: number) => {
            if (jn.secondaryColumns && jn.secondaryColumns.length > 0)
              jn.secondaryColumns.forEach((col: string) =>
                selectParts.push(
                  `j${idx}.${quoteIdent(col, "postgres")} AS ${quoteIdent(
                    `join_${idx}_${col}`,
                    "postgres"
                  )}`
                )
              );
            else selectParts.push(`j${idx}.*`);
          });
          let fromJoin = `FROM ${pQualified} AS p`;
          (joins as any[]).forEach((jn: any, idx: number) => {
            const jt = (jn.joinType || "INNER").toUpperCase();
            const on = `p.${quoteIdent(
              jn.primaryColumn || "",
              "postgres"
            )} = j${idx}.${quoteIdent(jn.secondaryColumn || "", "postgres")}`;
            fromJoin += ` ${jt} JOIN ${jQualified[idx]} AS j${idx} ON ${on}`;
          });
          const { clause, params } = buildWhereClausePgStar(
            conditions || [],
            (joins as any[]).length
          );
          const batchSize = 5000;
          async function* generator() {
            let offset = 0;
            for (;;) {
              const sql = `SELECT ${selectParts.join(
                ", "
              )} ${fromJoin} ${clause} LIMIT $${params.length + 1} OFFSET $${
                params.length + 2
              }`;
              const res = await client.query(sql, [
                ...params,
                batchSize,
                offset,
              ]);
              const rows = res.rows || [];
              if (rows.length === 0) break;
              yield rows;
              if (rows.length < batchSize) break;
              offset += batchSize;
            }
            await client.end();
          }
          const headerKeys = [
            ...(primaryColumns || []).map((c: string) => `primary_${c}`),
            ...(joins as any[]).flatMap((jn: any, idx: number) =>
              (jn.secondaryColumns || []).map((c: string) => `join_${idx}_${c}`)
            ),
          ];
          const buffer = await toExcelBuffer(generator(), headerKeys);
          const ab = buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
          );
          return new NextResponse(ab as any, {
            status: 200,
            headers: {
              "Content-Type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": `attachment; filename="filtro_join.xlsx"`,
            },
          });
        } catch (e: any) {
          return NextResponse.json(
            { ok: false, error: e.message || "Error exportando Excel" },
            { status: 500 }
          );
        }
      }

      return NextResponse.json(
        { ok: false, error: "Tipo de base de datos no soportado en JOIN" },
        { status: 400 }
      );
    }

    // JOIN binario (legacy)
    if (isBinaryJoin) {
      const {
        leftTable,
        rightTable,
        joinConditions,
        leftColumns,
        rightColumns,
        conditions,
      } = body as JoinPayload;

      if (
        !leftTable ||
        !rightTable ||
        !joinConditions ||
        joinConditions.length === 0
      ) {
        return NextResponse.json(
          { ok: false, error: "Configuración de JOIN incompleta" },
          { status: 400 }
        );
      }

      // Excel guard (we only support Excel-Excel in the join route); export follows same policy
      if (type === ("excel" as any) || secondaryType === ("excel" as any)) {
        if (
          !(
            type === ("excel" as any) &&
            (!secondaryConnectionId || secondaryType === ("excel" as any))
          )
        ) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "JOIN entre Excel y una BD externa no soportado para exportación",
            },
            { status: 400 }
          );
        }
      }

      // Determine db type if not provided
      if (!type) {
        const p = port ? Number(port) : undefined;
        if (p === 5432 || p === 5433) type = "postgres";
        else if (p === 3306 || p === 3307) type = "mysql";
        else type = "postgres"; // default
      }

      if (
        type === "postgres" ||
        type === "postgresql" ||
        type === ("excel" as any)
      ) {
        // Postgres client (either external PG or internal Supabase for Excel)
        let client: PgClient;
        let dbType: "postgres" = "postgres";
        let leftQualified = leftTable;
        let rightQualified = rightTable;

        if (type === ("excel" as any)) {
          const dbUrl = process.env.SUPABASE_DB_URL;
          if (!dbUrl)
            return NextResponse.json(
              {
                ok: false,
                error: "Configuración de base de datos interna no disponible",
              },
              { status: 500 }
            );
          client = new PgClient({ connectionString: dbUrl } as any);
          // Map to data_warehouse physical names
          const { data: leftMeta } = await supabase
            .from("data_tables")
            .select("physical_schema_name, physical_table_name")
            .eq("connection_id", String(connectionId))
            .single();
          const { data: rightMeta } = await supabase
            .from("data_tables")
            .select("physical_schema_name, physical_table_name")
            .eq("connection_id", String(secondaryConnectionId))
            .single();
          const ls =
            (leftMeta as any)?.physical_schema_name || "data_warehouse";
          const ln =
            (leftMeta as any)?.physical_table_name ||
            `import_${String(connectionId).replace(/-/g, "_")}`;
          const rs =
            (rightMeta as any)?.physical_schema_name || "data_warehouse";
          const rn =
            (rightMeta as any)?.physical_table_name ||
            `import_${String(secondaryConnectionId).replace(/-/g, "_")}`;
          leftQualified = `${ls}.${ln}`;
          rightQualified = `${rs}.${rn}`;
        } else {
          if (!password)
            return NextResponse.json(
              { ok: false, error: "Se requiere contraseña para PostgreSQL" },
              { status: 400 }
            );
          client = new PgClient({
            host,
            user,
            database,
            port: port ? Number(port) : 5432,
            password,
            connectionTimeoutMillis: 8000,
            ssl: ssl ? { rejectUnauthorized: false } : undefined,
          } as any);
        }

        await client.connect();

        const leftQ = quoteQualified(leftQualified!, "postgres");
        const rightQ = quoteQualified(rightQualified!, "postgres");

        // Build column selection: if none provided, alias all columns using information_schema
        let lCols = leftColumns;
        let rCols = rightColumns;
        if (!lCols || lCols.length === 0 || !rCols || rCols.length === 0) {
          const [ls, ln] = leftQualified!.includes(".")
            ? leftQualified!.split(".", 2)
            : ["public", leftQualified!];
          const [rs, rn] = rightQualified!.includes(".")
            ? rightQualified!.split(".", 2)
            : ["public", rightQualified!];
          if (!lCols || lCols.length === 0) {
            const res = await client.query(
              `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,
              [ls, ln]
            );
            lCols = res.rows.map((r: any) => r.column_name);
          }
          if (!rCols || rCols.length === 0) {
            const res = await client.query(
              `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,
              [rs, rn]
            );
            rCols = res.rows.map((r: any) => r.column_name);
          }
        }
        const selectList = [
          ...(lCols || []).map(
            (c) =>
              `l.${quoteIdent(c, "postgres")} AS ${quoteIdent(
                `left_${c}`,
                "postgres"
              )}`
          ),
          ...(rCols || []).map(
            (c) =>
              `r.${quoteIdent(c, "postgres")} AS ${quoteIdent(
                `right_${c}`,
                "postgres"
              )}`
          ),
        ].join(", ");

        const joinClause = buildJoinClauseBinary(
          joinConditions!,
          "postgres",
          rightQ
        );
        const { clause, params } = buildWhereClausePg(conditions || []);

        const batchSize = 5000;
        async function* generator() {
          let offset = 0;
          for (;;) {
            const sql = `SELECT ${selectList} FROM ${leftQ} AS l ${joinClause} ${clause} LIMIT $${
              params.length + 1
            } OFFSET $${params.length + 2}`;
            const res = await client.query(sql, [...params, batchSize, offset]);
            const rows = res.rows || [];
            if (rows.length === 0) break;
            yield rows;
            if (rows.length < batchSize) break;
            offset += batchSize;
          }
          await client.end();
        }

        const headerKeys = [
          ...(lCols || []).map((c) => `left_${c}`),
          ...(rCols || []).map((c) => `right_${c}`),
        ];
        const buffer = await toExcelBuffer(generator(), headerKeys);
        const ab = buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        );
        return new NextResponse(ab as any, {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="filtro_join.xlsx"`,
          },
        });
      }

      if (type === "mysql") {
        if (!password)
          return NextResponse.json(
            { ok: false, error: "Se requiere contraseña para MySQL" },
            { status: 400 }
          );
        const connection = await mysql.createConnection({
          host,
          user,
          database,
          password,
          port: port ? Number(port) : 3306,
          connectTimeout: 8000,
        });

        const leftQ = quoteQualified(leftTable!, "mysql");
        const rightQ = quoteQualified(rightTable!, "mysql");

        // Resolve columns if missing using information_schema
        let lCols = (body as JoinPayload).leftColumns;
        let rCols = (body as JoinPayload).rightColumns;
        if (!lCols || lCols.length === 0) {
          const [ls, ln] = leftTable!.includes(".")
            ? leftTable!.split(".", 2)
            : [database || "", leftTable!];
          const [rowsCols] = await connection.execute<any[]>(
            `SELECT COLUMN_NAME as c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
            [ls, ln]
          );
          lCols = rowsCols.map((r) => r.c);
        }
        if (!rCols || rCols.length === 0) {
          const [rs, rn] = rightTable!.includes(".")
            ? rightTable!.split(".", 2)
            : [database || "", rightTable!];
          const [rowsCols] = await connection.execute<any[]>(
            `SELECT COLUMN_NAME as c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
            [rs, rn]
          );
          rCols = rowsCols.map((r) => r.c);
        }
        const selectList = [
          ...(lCols || []).map(
            (c) =>
              `l.${quoteIdent(c, "mysql")} AS ${quoteIdent(
                `left_${c}`,
                "mysql"
              )}`
          ),
          ...(rCols || []).map(
            (c) =>
              `r.${quoteIdent(c, "mysql")} AS ${quoteIdent(
                `right_${c}`,
                "mysql"
              )}`
          ),
        ].join(", ");

        const joinClause = buildJoinClauseBinary(
          joinConditions!,
          "mysql",
          rightQ
        );
        const { clause, params } = buildWhereClauseMy(conditions || []);

        const batchSize = 5000;
        async function* generator() {
          let offset = 0;
          for (;;) {
            const sql = `SELECT ${selectList} FROM ${leftQ} AS l ${joinClause} ${clause} LIMIT ? OFFSET ?`;
            const [rows] = await connection.execute<any[]>(sql, [
              ...params,
              batchSize,
              offset,
            ]);
            const arr = Array.isArray(rows) ? rows : [];
            if (arr.length === 0) break;
            yield arr;
            if (arr.length < batchSize) break;
            offset += batchSize;
          }
          await connection.end();
        }

        const headerKeys = [
          ...(lCols || []).map((c) => `left_${c}`),
          ...(rCols || []).map((c) => `right_${c}`),
        ];
        const buffer = await toExcelBuffer(generator(), headerKeys);
        const ab = buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        );
        return new NextResponse(ab as any, {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="filtro_join.xlsx"`,
          },
        });
      }

      return NextResponse.json(
        { ok: false, error: "Tipo de base de datos no soportado" },
        { status: 400 }
      );
    }

    // SINGLE TABLE path
    const { table, columns, conditions } = body as SinglePayload;
    if (!table)
      return NextResponse.json(
        { ok: false, error: "Tabla requerida" },
        { status: 400 }
      );

    // Excel single-table: use internal PG and data_warehouse schema
    if (type === "excel") {
      const { data: meta, error: metaError } = await supabase
        .from("data_tables")
        .select("physical_schema_name, physical_table_name")
        .eq("connection_id", String((body as any).connectionId))
        .single();
      if (metaError || !meta)
        return NextResponse.json(
          { ok: false, error: "Metadatos de Excel no encontrados" },
          { status: 404 }
        );
      const schema = (meta as any).physical_schema_name || "data_warehouse";
      const physical =
        (meta as any).physical_table_name ||
        `import_${String((body as any).connectionId).replace(/-/g, "_")}`;
      const dbUrl = process.env.SUPABASE_DB_URL;
      if (!dbUrl)
        return NextResponse.json(
          {
            ok: false,
            error: "Configuración de base de datos interna no disponible",
          },
          { status: 500 }
        );
      const client = new PgClient({ connectionString: dbUrl } as any);
      await client.connect();

      const fullQ = quoteQualified(`${schema}.${physical}`, "postgres");
      const colsList =
        columns && columns.length
          ? columns.map((c) => quoteIdent(c, "postgres")).join(", ")
          : "*";
      const { clause, params } = buildWhereClausePg(conditions || []);

      const batchSize = 5000;
      async function* generator() {
        let offset = 0;
        for (;;) {
          const sql = `SELECT ${colsList} FROM ${fullQ} ${clause} LIMIT $${
            params.length + 1
          } OFFSET $${params.length + 2}`;
          const res = await client.query(sql, [...params, batchSize, offset]);
          const rows = res.rows || [];
          if (rows.length === 0) break;
          yield rows;
          if (rows.length < batchSize) break;
          offset += batchSize;
        }
        await client.end();
      }

      const buffer = await toExcelBuffer(generator());
      const ab = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      );
      return new NextResponse(ab as any, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="filtro.xlsx"`,
        },
      });
    }

    if (!host || !user)
      return NextResponse.json(
        { ok: false, error: "Parámetros incompletos" },
        { status: 400 }
      );

    // Parse schema.table
    const [schema, tableName] = table.includes(".")
      ? table.split(".", 2)
      : ["public", table];

    if (type === "postgres" || type === "postgresql") {
      if (!password)
        return NextResponse.json(
          { ok: false, error: "Se requiere contraseña para PostgreSQL" },
          { status: 400 }
        );
      const client = new PgClient({
        host,
        user,
        database,
        port: port ? Number(port) : 5432,
        password,
        connectionTimeoutMillis: 8000,
        ssl: ssl ? { rejectUnauthorized: false } : undefined,
      } as any);
      await client.connect();

      const fullQ = `${quoteIdent(schema, "postgres")}.${quoteIdent(
        tableName,
        "postgres"
      )}`;
      const colsList =
        columns && columns.length
          ? columns.map((c) => quoteIdent(c, "postgres")).join(", ")
          : "*";
      const { clause, params } = buildWhereClausePg(conditions || []);

      const batchSize = 5000;
      async function* generator() {
        let offset = 0;
        for (;;) {
          const sql = `SELECT ${colsList} FROM ${fullQ} ${clause} LIMIT $${
            params.length + 1
          } OFFSET $${params.length + 2}`;
          const res = await client.query(sql, [...params, batchSize, offset]);
          const rows = res.rows || [];
          if (rows.length === 0) break;
          yield rows;
          if (rows.length < batchSize) break;
          offset += batchSize;
        }
        await client.end();
      }

      const buffer = await toExcelBuffer(generator());
      const ab = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      );
      return new NextResponse(ab as any, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="filtro.xlsx"`,
        },
      });
    }

    if (type === "mysql") {
      if (!password)
        return NextResponse.json(
          { ok: false, error: "Se requiere contraseña para MySQL" },
          { status: 400 }
        );
      const connection = await mysql.createConnection({
        host,
        user,
        database,
        password,
        port: port ? Number(port) : 3306,
        connectTimeout: 8000,
      });
      const fullQ = `${quoteIdent(schema, "mysql")}.${quoteIdent(
        tableName,
        "mysql"
      )}`;
      const colsList =
        columns && columns.length
          ? columns.map((c) => quoteIdent(c, "mysql")).join(", ")
          : "*";
      const { clause, params } = buildWhereClauseMy(conditions || []);

      const batchSize = 5000;
      async function* generator() {
        let offset = 0;
        for (;;) {
          const sql = `SELECT ${colsList} FROM ${fullQ} ${clause} LIMIT ? OFFSET ?`;
          const [rows] = await connection.execute<any[]>(sql, [
            ...params,
            batchSize,
            offset,
          ]);
          const arr = Array.isArray(rows) ? rows : [];
          if (arr.length === 0) break;
          yield arr;
          if (arr.length < batchSize) break;
          offset += batchSize;
        }
        await connection.end();
      }

      const buffer = await toExcelBuffer(generator());
      const ab = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      );
      return new NextResponse(ab as any, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="filtro.xlsx"`,
        },
      });
    }

    return NextResponse.json(
      { ok: false, error: "Tipo de base de datos no soportado" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Error exportando Excel" },
      { status: 500 }
    );
  }
}
