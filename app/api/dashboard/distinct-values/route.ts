// src/app/api/dashboard/distinct-values/route.ts

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

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

export async function POST(req: NextRequest) {
  try {
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
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body: DistinctRequest = await req.json();
    console.log("[distinct-values API] Received request:", {
      tableName: body.tableName,
      field: body.field,
      limit: body.limit,
      order: body.order,
      transform: body.transform,
      hasFilters: !!body.filters,
      filtersCount: body.filters?.length || 0,
    });

    if (!body.tableName || !body.tableName.startsWith("etl_output.")) {
      console.error(
        "[distinct-values API] Invalid table name:",
        body.tableName
      );
      throw new Error("Nombre de tabla inválido o no permitido.");
    }
    if (!body.field) throw new Error("Campo requerido");

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Extraer schema y tabla - el tableName viene como "etl_output.nombre_tabla"
    // Pero el nombre de tabla puede contener puntos, así que solo dividimos en el primer punto
    const dotIndex = body.tableName.indexOf(".");
    if (dotIndex === -1) {
      throw new Error("Formato de tableName inválido");
    }

    const schema = body.tableName.substring(0, dotIndex);
    const table = body.tableName.substring(dotIndex + 1);

    console.log("[distinct-values API] Parsed table name:", {
      originalTableName: body.tableName,
      schema,
      table,
    });

    const safeField = body.field.replace(/"/g, '""');
    const safeTable = table.replace(/"/g, '""');

    let selectExpression = `"${safeField}"`;

    const transformOp = (body.transform || "").toUpperCase();
    console.log("[distinct-values API] Transform op:", transformOp);

    if (transformOp === "YEAR") {
      console.log("[distinct-values API] Applying YEAR transformation");
      selectExpression = `EXTRACT(YEAR FROM (
        CASE
          WHEN "${safeField}"::text ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date("${safeField}"::text, 'DD/MM/YYYY')
          WHEN "${safeField}"::text LIKE '%, % de % de %' THEN to_date("${safeField}"::text, 'Day, DD "de" Month "de" YYYY')
          ELSE "${safeField}"::date
        END
      ))`;
    }

    let query = `SELECT DISTINCT ${selectExpression} AS value FROM "${schema}"."${safeTable}"`;

    console.log("[distinct-values API] Query parts:", {
      schema,
      table,
      safeTable,
      safeField,
      baseQuery: query,
    });

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

    const { data, error } = await supabaseAdmin.rpc("execute_sql", {
      sql_query: query,
    });
    if (error) throw new Error(error.message);

    const rows = (data || []).map((item: any) => item.result || item);
    const values = rows.map((r: any) => r.value);
    return NextResponse.json(values);
  } catch (err: any) {
    console.error("Error en API Route /api/dashboard/distinct-values:", err);
    return NextResponse.json(
      { error: err.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}
