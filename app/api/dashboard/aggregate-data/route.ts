// src/app/api/dashboard/aggregate-data/route.ts

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

// --- Interfaces ---
interface Metric {
  field: string;
  func: string;
  alias: string;
  cast?: "numeric" | "sanitize";
}

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

interface AggregationRequest {
  tableName: string;
  dimension?: string;
  metrics: Metric[];
  filters?: Filter[];
  orderBy?: OrderBy;
  limit?: number;
}

// --- Constantes ---
const ALLOWED_AGG_FUNCTIONS = [
  "SUM",
  "AVG",
  "COUNT",
  "MIN",
  "MAX",
  "COUNT(DISTINCT",
];
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

const normalizeStr = (str: string) =>
  str ? str.replace(/\s+/g, "").toUpperCase() : "";

export async function POST(req: NextRequest) {
  try {
    const body: AggregationRequest = await req.json();
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

    if (!body.tableName || !body.tableName.startsWith("etl_output.")) {
      throw new Error("Nombre de tabla inválido o no permitido.");
    }

    const [schema, table] = body.tableName.split(".");

    // 1. Construcción de Métricas (Usamos metric_X internamente para seguridad SQL)
    const metricClauses = body.metrics
      .map((m, i) => {
        const func = m.func.toUpperCase();
        const safeField = m.field.replace(/"/g, '""');

        const fieldExpr = (() => {
          if (m.cast === "sanitize")
            return `regexp_replace("${safeField}"::text, '[^0-9\\.-]', '', 'g')::numeric`;
          if (m.cast === "numeric") return `"${safeField}"::numeric`;
          return `"${safeField}"`;
        })();

        // Internamente usamos metric_0, metric_1 para evitar errores de SQL con caracteres raros
        const internalAlias = `metric_${i}`;

        // Guardamos el internalAlias en el objeto métrica para usarlo en OrderBy
        (m as any).internalAlias = internalAlias;

        if (func.startsWith("COUNT(DISTINCT"))
          return `COUNT(DISTINCT ${fieldExpr}) AS "${internalAlias}"`;
        return `${func}(${fieldExpr}) AS "${internalAlias}"`;
      })
      .join(", ");

    // 2. Construcción de Dimensión
    let dimensionSelectClause = "";
    let dimensionGroupByClause = "";

    if (body.dimension) {
      const safeDimension = body.dimension.replace(/"/g, '""');
      const coalesceExpression = `COALESCE("${safeDimension}"::text, 'Sin Categoría')`;
      dimensionSelectClause = `${coalesceExpression} AS "${safeDimension}"`;
      dimensionGroupByClause = coalesceExpression;
    }

    const selectClause = [dimensionSelectClause, metricClauses]
      .filter(Boolean)
      .join(", ");
    let query = `SELECT ${selectClause} FROM "${schema}"."${table}"`;

    // 3. Filtros
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

          if (op === "MONTH") {
            if (Array.isArray(f.value)) {
              const list = f.value
                .map((v) => Number(v))
                .filter((n) => !isNaN(n))
                .join(", ");
              return `EXTRACT(MONTH FROM ${fieldExpression}) IN (${list})`;
            }
            return `EXTRACT(MONTH FROM ${fieldExpression}) = ${Number(
              f.value
            )}`;
          }
          if (op === "YEAR") {
            if (Array.isArray(f.value)) {
              const list = f.value
                .map((v) => Number(v))
                .filter((n) => !isNaN(n))
                .join(", ");
              return `EXTRACT(YEAR FROM ${fieldExpression}) IN (${list})`;
            }
            return `EXTRACT(YEAR FROM ${fieldExpression}) = ${Number(f.value)}`;
          }
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

    // 4. Group By
    if (dimensionGroupByClause) {
      query += ` GROUP BY ${dimensionGroupByClause}`;
    }

    // 5. Order By Inteligente
    if (body.orderBy) {
      let orderByField = `"${body.orderBy.field}"`;
      const requestedSortNormalized = normalizeStr(body.orderBy.field);

      // Buscar si el orden solicitado coincide con alguna métrica
      const matchedMetric = body.metrics.find((m, i) => {
        const signature = `${m.func}(${m.field})`;
        // Comparar con el Alias que pidió el usuario O la firma de la función
        return (
          requestedSortNormalized === normalizeStr(m.alias || "") ||
          requestedSortNormalized === normalizeStr(signature)
        );
      });

      if (matchedMetric) {
        // Ordenamos por el alias interno (metric_0) para que SQL no falle
        orderByField = `"${(matchedMetric as any).internalAlias}"`;
      }

      query += ` ORDER BY ${orderByField} ${body.orderBy.direction.toUpperCase()}`;
    }

    if (body.limit) {
      const lim = Math.max(1, Math.min(5000, parseInt(String(body.limit), 10)));
      query += ` LIMIT ${lim}`;
    }

    // 6. Ejecución
    const { data, error } = await (supabase as any).rpc("execute_sql", {
      sql_query: query,
    });

    if (error) throw new Error(error.message);

    const results = data || [];

    // =====================================================================
    // 7. TRANSFORMACIÓN FINAL (La clave de la solución)
    // Convertimos 'metric_0' -> 'SUM(primary_quantity_sold)' (o el alias del usuario)
    // =====================================================================

    const mappedResults = results.map((row: any) => {
      const newRow = { ...row };

      body.metrics.forEach((m, i) => {
        const internalKey = `metric_${i}`;
        // El nombre que espera el frontend es el Alias del usuario O la firma "FUNC(field)"
        const externalKey = m.alias ? m.alias : `${m.func}(${m.field})`;

        // Si existe el dato interno, lo movemos a la clave externa y borramos la interna
        if (Object.prototype.hasOwnProperty.call(newRow, internalKey)) {
          newRow[externalKey] = newRow[internalKey];
          delete newRow[internalKey];
        }
      });

      return newRow;
    });

    return NextResponse.json(mappedResults);
  } catch (err: any) {
    console.error("Error en API:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
