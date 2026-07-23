import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  buildAggregationFilterSqlClause,
  normalizeAggregationFilterOperator,
} from "@/lib/dashboard/buildAggregationFilterSql";
import { safeNumericCast } from "@/lib/dashboard/coerceNumericSqlExpr";

interface Filter {
  field: string;
  operator: string;
  value: any;
  cast?: "numeric";
}

interface OrderBy {
  field: string;
  direction: "ASC" | "DESC";
}

interface RawDataRequest {
  tableName: string;
  columns?: string[];
  filters?: Filter[];
  orderBy?: OrderBy;
  limit?: number;
}

const ALLOWED_OPERATORS = new Set([
  "=",
  "!=",
  "<>",
  ">",
  ">=",
  "<",
  "<=",
  "ILIKE",
  "LIKE",
  "IN",
  "BETWEEN",
  "IS",
  "IS NOT",
  "MONTH",
  "YEAR",
  "DAY",
  "YEAR_MONTH",
  "QUARTER",
  "SEMESTER",
  "CONTAINS",
  "NOT_CONTAINS",
  "STARTS_WITH",
  "ENDS_WITH",
  "EXACT",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const awaitedParams = await params;
    const token = awaitedParams["token"];
    const body: RawDataRequest = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    if (!body.tableName) {
      throw new Error("Nombre de tabla inválido o no permitido.");
    }

    const supabase = createServiceRoleClient();

    // --- SECURITY CHECK ---
    const { data: dashboard } = await supabase
      .from("dashboard")
      .select("etl_id, visibility")
      .eq("share_token", token)
      .maybeSingle();

    if (!dashboard?.etl_id) {
      return NextResponse.json(
        { error: "Dashboard invalid or not found" },
        { status: 404 }
      );
    }

    if (dashboard.visibility === "private") {
      return NextResponse.json(
        { error: "Dashboard is private" },
        { status: 403 }
      );
    }

    const { data: latestRun } = await supabase
      .from("etl_runs_log")
      .select("destination_schema,destination_table_name")
      .eq("etl_id", dashboard.etl_id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let validTable = "";
    if (latestRun) {
      const schema = latestRun.destination_schema || "etl_output";
      validTable = `${schema}.${latestRun.destination_table_name}`;
    } else {
      validTable = "public.etl_data_warehouse";
    }

    const requested = body.tableName.includes(".")
      ? body.tableName
      : `etl_output.${body.tableName}`;
    const allowed = validTable;

    if (requested !== allowed) {
      if (
        requested !== "public.etl_data_warehouse" ||
        allowed !== "public.etl_data_warehouse"
      ) {
        return NextResponse.json(
          { error: "Unauthorized table access" },
          { status: 403 }
        );
      }
    }
    // ---------------------

    const [schema, table] = requested.split(".");

    // Construir SELECT
    let selectClause = "*";
    if (body.columns && body.columns.length > 0) {
      selectClause = body.columns
        .map((c: any) => `"${c.replace(/"/g, '""')}"`)
        .join(", ");
    }

    let query = `SELECT ${selectClause} FROM "${schema}"."${table}"`;

    // Filtros
    if (body.filters && body.filters.length > 0) {
      const whereClauses = body.filters
        .map((f: any) => {
          const safeField = f.field.replace(/"/g, '""');
          const op = normalizeAggregationFilterOperator(f.operator);
          if (!ALLOWED_OPERATORS.has(op) && !/^[<>!=]+$/.test(op)) {
            return "TRUE";
          }

          let fieldExpression: string;
          if (op === "MONTH" || op === "DAY" || op === "YEAR" || op === "YEAR_MONTH" || op === "QUARTER" || op === "SEMESTER") {
            fieldExpression = `(
              CASE
                WHEN "${safeField}"::text ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date("${safeField}"::text, 'DD/MM/YYYY')
                WHEN "${safeField}"::text LIKE '%, % de % de %' THEN to_date("${safeField}"::text, 'Day, DD "de" Month "de" YYYY')
                ELSE "${safeField}"::date
              END
            )`;
          } else if (f.cast === "numeric") {
            fieldExpression = safeNumericCast(`"${safeField}"`);
          } else {
            fieldExpression = `"${safeField}"`;
          }

          return buildAggregationFilterSqlClause(
            { field: f.field, operator: op, value: f.value, cast: f.cast },
            { fieldExpression }
          );
        })
        .join(" AND ");
      if (whereClauses) query += ` WHERE ${whereClauses}`;
    }

    // Order By
    if (body.orderBy) {
      const safeOrderField = body.orderBy.field.replace(/"/g, '""');
      query += ` ORDER BY "${safeOrderField}" ${body.orderBy.direction.toUpperCase()}`;
    }

    // Limit
    if (body.limit) {
      const lim = Math.max(1, Math.min(5000, parseInt(String(body.limit), 10)));
      query += ` LIMIT ${lim}`;
    }

    // Ejecución
    const { data, error } = await (supabase as any).rpc("execute_sql", {
      sql_query: query,
    });

    if (error) throw new Error(error.message);

    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
