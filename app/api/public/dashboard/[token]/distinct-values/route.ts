import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

interface Filter {
  field: string;
  operator: string;
  value: any;
}

interface DistinctRequest {
  tableName: string; // schema.table
  field: string;
  filters?: Filter[]; // opcional, para acotar el universo
  limit?: number; // 1..1000
  order?: "ASC" | "DESC";
  transform?: "YEAR" | "MONTH" | "DAY";
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
]);

function toSqlLiteral(v: any): string {
  if (v === null || typeof v === "undefined") return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const awaitedParams = await params;
    const token = awaitedParams["token"];
    const body: DistinctRequest = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    if (!body.tableName)
      throw new Error("Nombre de tabla inválido o no permitido.");
    if (!body.field) throw new Error("Campo requerido");

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

    // Extraer schema y tabla
    const dotIndex = requested.indexOf(".");
    const schema = requested.substring(0, dotIndex);
    const table = requested.substring(dotIndex + 1);

    const safeField = body.field.replace(/"/g, '""');
    const safeTable = table.replace(/"/g, '""');

    let selectExpression = `"${safeField}"`;

    const transformOp = (body.transform || "").toUpperCase();
    console.log("[public distinct-values API] Transform op:", transformOp);

    if (transformOp === "YEAR") {
      console.log("[public distinct-values API] Applying YEAR transformation");
      selectExpression = `EXTRACT(YEAR FROM (
        CASE
          WHEN "${safeField}"::text ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date("${safeField}"::text, 'DD/MM/YYYY')
          WHEN "${safeField}"::text LIKE '%, % de % de %' THEN to_date("${safeField}"::text, 'Day, DD "de" Month "de" YYYY')
          ELSE "${safeField}"::date
        END
      ))`;
    }

    let query = `SELECT DISTINCT ${selectExpression} AS value FROM "${schema}"."${safeTable}"`;

    if (body.filters && body.filters.length > 0) {
      const whereClauses = body.filters
        .filter((f) => f.field && f.operator)
        .map((f) => {
          const fld = f.field.replace(/"/g, '""');
          const op = (f.operator || "=").toUpperCase().trim();
          if (!ALLOWED_OPERATORS.has(op)) {
            throw new Error(`Operador no permitido: ${op}`);
          }
          if (op === "IN") {
            const arr = Array.isArray(f.value) ? f.value : [];
            const list = arr.map((x) => toSqlLiteral(x)).join(", ");
            return `"${fld}" IN (${list})`;
          }
          if (op === "BETWEEN") {
            let from: any;
            let to: any;
            if (Array.isArray(f.value)) {
              [from, to] = f.value;
            } else if (f.value && typeof f.value === "object") {
              from = (f.value as any).from ?? (f.value as any).start;
              to = (f.value as any).to ?? (f.value as any).end;
            }
            if (typeof from === "undefined" || typeof to === "undefined") {
              throw new Error(
                `Filtro BETWEEN requiere 'from' y 'to' para el campo ${fld}`
              );
            }
            return `"${fld}" BETWEEN ${toSqlLiteral(from)} AND ${toSqlLiteral(
              to
            )}`;
          }
          if ((op === "IS" || op === "IS NOT") && f.value === null) {
            return `"${fld}" ${op} NULL`;
          }
          return `"${fld}" ${op} ${toSqlLiteral(f.value)}`;
        })
        .join(" AND ");
      if (whereClauses) query += ` WHERE ${whereClauses}`;
    }

    const orderDir =
      (body.order || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
    // Usamos "value" porque es el alias definido en el SELECT DISTINCT
    query += ` ORDER BY value ${orderDir}`;
    const lim = Math.max(
      1,
      Math.min(1000, parseInt(String(body.limit ?? 200), 10))
    );
    query += ` LIMIT ${lim}`;

    const { data, error } = await (supabase as any).rpc("execute_sql", {
      sql_query: query,
    });
    if (error) throw new Error(error.message);

    const rows = (data || []).map((item: any) => item.result || item);
    const values = rows.map((r: any) => r.value);
    return NextResponse.json(values);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}
