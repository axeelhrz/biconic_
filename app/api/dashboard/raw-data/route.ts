import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

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
]);

function toSqlLiteral(v: any): string {
  if (v === null || typeof v === "undefined") return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

export async function POST(req: NextRequest) {
  try {
    const body: RawDataRequest = await req.json();
    const cookieStore = await cookies();

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session)
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const allowedPrefixes = ["etl_output.", "public."];
    if (!body.tableName || !allowedPrefixes.some((p) => body.tableName.startsWith(p))) {
      throw new Error("Nombre de tabla inválido o no permitido.");
    }

    const [schema, table] = body.tableName.split(".");

    // Construir SELECT
    let selectClause = "*";
    if (body.columns && body.columns.length > 0) {
      selectClause = body.columns
        .map((c) => `"${c.replace(/"/g, '""')}"`)
        .join(", ");
    }

    let query = `SELECT ${selectClause} FROM "${schema}"."${table}"`;

    // Filtros
    if (body.filters && body.filters.length > 0) {
      const whereClauses = body.filters
        .map((f) => {
          const safeField = f.field.replace(/"/g, '""');
          const op = (f.operator || "=").toUpperCase().trim();

          let fieldExpression;
          if (op === "MONTH" || op === "DAY" || op === "YEAR") {
            fieldExpression = `(
              CASE
                WHEN "${safeField}"::text ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date("${safeField}"::text, 'DD/MM/YYYY')
                WHEN "${safeField}"::text LIKE '%, % de % de %' THEN to_date("${safeField}"::text, 'Day, DD "de" Month "de" YYYY')
                ELSE "${safeField}"::date
              END
            )`;
          } else {
            fieldExpression =
              f.cast === "numeric"
                ? `"${safeField}"::numeric`
                : `"${safeField}"`;
          }

          if (op === "MONTH")
            return `EXTRACT(MONTH FROM ${fieldExpression}) = ${Number(
              f.value
            )}`;
          if (op === "YEAR")
            return `EXTRACT(YEAR FROM ${fieldExpression}) = ${Number(f.value)}`;
          if (op === "DAY") {
            const dayStr = String(f.value || "").trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) return "TRUE";
            return `${fieldExpression} = DATE '${dayStr}'`;
          }
          if (op === "IN") {
            const list = (Array.isArray(f.value) ? f.value : [])
              .map((x) => toSqlLiteral(x))
              .join(", ");
            return `${fieldExpression} IN (${list})`;
          }
          if (op === "BETWEEN") {
            let from: any, to: any;
            if (Array.isArray(f.value)) [from, to] = f.value;
            else if (f.value && typeof f.value === "object") {
              from = (f.value as any).from;
              to = (f.value as any).to;
            }
            return `${fieldExpression} BETWEEN ${toSqlLiteral(
              from
            )} AND ${toSqlLiteral(to)}`;
          }
          if ((op === "IS" || op === "IS NOT") && f.value === null)
            return `"${safeField}" ${op} NULL`;

          return `${fieldExpression} ${op} ${toSqlLiteral(f.value)}`;
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
    console.error("Error en API Raw Data:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
