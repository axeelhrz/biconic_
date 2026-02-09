// src/app/api/dashboard/aggregate-data/route.ts

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

// --- Interfaces ---
interface MetricCondition {
  field: string;
  operator: string;
  value: any;
}

interface Metric {
  field: string;
  func: string;
  alias: string;
  cast?: "numeric" | "sanitize";
  /** Condición: solo se agregan filas que cumplan (ej. estado = 'Aprobado'). */
  condition?: MetricCondition;
  /** Fórmula derivada que referencia otras métricas por alias interno (metric_0, metric_1...). Ej: "(metric_0 - metric_1) / NULLIF(metric_0, 0)". */
  formula?: string;
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
  /** Múltiples dimensiones (ej. mes + categoría). Se hace GROUP BY todas. */
  dimensions?: string[];
  metrics: Metric[];
  filters?: Filter[];
  orderBy?: OrderBy;
  limit?: number;
  /** Acumulado: running_sum = total acumulado; ytd = año hasta la fecha (requiere dimensión tipo fecha). */
  cumulative?: "none" | "running_sum" | "ytd";
  /** Comparación temporal: añade métrica_prev y métrica_var_pct vs período anterior. */
  comparePeriod?: "previous_year" | "previous_month";
  /** Columna de fecha para YTD o comparePeriod (ej. transaction_date). */
  dateDimension?: string;
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

    // Helper: condición WHEN para métrica (solo la parte "campo op valor")
    const buildWhenClause = (cond: MetricCondition): string => {
      const safeC = cond.field.replace(/"/g, '""');
      const op = (cond.operator || "=").toUpperCase().trim();
      const f = `"${safeC}"`;
      if (op === "IN") {
        const list = (Array.isArray(cond.value) ? cond.value : [cond.value])
          .map((x: any) => toSqlLiteral(x))
          .join(", ");
        return `${f} IN (${list})`;
      }
      if ((op === "IS" || op === "IS NOT") && cond.value == null) return `${f} ${op} NULL`;
      return `${f} ${op} ${toSqlLiteral(cond.value)}`;
    };
    const buildConditionExpr = (cond: MetricCondition, thenExpr: string): string =>
      `CASE WHEN ${buildWhenClause(cond)} THEN ${thenExpr} END`;

    const metricsBase = body.metrics.filter((m) => !m.formula);
    const metricsFormula = body.metrics.filter((m) => m.formula);

    // 1. Construcción de Métricas (condicionales y estándar; fórmulas después)
    const metricClauses = metricsBase
      .map((m) => {
        const i = body.metrics.indexOf(m);
        const func = m.func.toUpperCase();
        const safeField = m.field.replace(/"/g, '""');

        const fieldExpr = (() => {
          if (m.cast === "sanitize")
            return `regexp_replace("${safeField}"::text, '[^0-9\\.-]', '', 'g')::numeric`;
          if (m.cast === "numeric") return `"${safeField}"::numeric`;
          return `"${safeField}"`;
        })();

        const internalAlias = `metric_${i}`;
        (m as any).internalAlias = internalAlias;

        let aggExpr: string;
        if (m.condition) {
          const whenClause = buildWhenClause(m.condition);
          if (func === "COUNT" || func.startsWith("COUNT(DISTINCT"))
            aggExpr = `COUNT(CASE WHEN ${whenClause} THEN 1 END)`;
          else
            aggExpr = `${func}(${buildConditionExpr(m.condition, fieldExpr)})`;
        } else {
          if (func.startsWith("COUNT(DISTINCT"))
            aggExpr = `COUNT(DISTINCT ${fieldExpr})`;
          else
            aggExpr = `${func}(${fieldExpr})`;
        }
        return `${aggExpr} AS "${internalAlias}"`;
      })
      .join(", ");

    // 2. Dimensiones (una o varias)
    const dimList = (body.dimensions && body.dimensions.length > 0)
      ? body.dimensions
      : body.dimension
        ? [body.dimension]
        : [];
    let dimensionSelectClause = "";
    let dimensionGroupByClause = "";

    if (dimList.length > 0) {
      const parts = dimList.map((d) => {
        const safeD = d.replace(/"/g, '""');
        return `COALESCE("${safeD}"::text, 'Sin Categoría') AS "${safeD}"`;
      });
      dimensionSelectClause = parts.join(", ");
      dimensionGroupByClause = dimList
        .map((d) => {
          const safeD = d.replace(/"/g, '""');
          return `COALESCE("${safeD}"::text, 'Sin Categoría')`;
        })
        .join(", ");
    }

    const selectClause = [dimensionSelectClause, metricClauses]
      .filter(Boolean)
      .join(", ");
    let query = `SELECT ${selectClause} FROM "${schema}"."${table}"`;

    // 3. Filtros
    let whereClausesStr = "";
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
      whereClausesStr = whereClauses || "";
      if (whereClausesStr) query += ` WHERE ${whereClausesStr}`;
    }

    // 4. Group By
    if (dimensionGroupByClause) {
      query += ` GROUP BY ${dimensionGroupByClause}`;
    }

    // 5. Order By (dimensión o métrica por alias interno)
    if (body.orderBy) {
      let orderByField = `"${body.orderBy.field.replace(/"/g, '""')}"`;
      const requestedSortNormalized = normalizeStr(body.orderBy.field);
      const dimMatch = dimList.find((d) => normalizeStr(d) === requestedSortNormalized);
      if (dimMatch) {
        orderByField = `"${dimMatch.replace(/"/g, '""')}"`;
      } else {
        const matchedMetric = body.metrics.find((m) => {
          const sig = `${m.func}(${m.field})`;
          return (
            requestedSortNormalized === normalizeStr(m.alias || "") ||
            requestedSortNormalized === normalizeStr(sig)
          );
        });
        if (matchedMetric)
          orderByField = `"${(matchedMetric as any).internalAlias}"`;
      }
      query += ` ORDER BY ${orderByField} ${body.orderBy.direction.toUpperCase()}`;
    }

    if (body.limit) {
      const lim = Math.max(1, Math.min(5000, parseInt(String(body.limit), 10)));
      query += ` LIMIT ${lim}`;
    }

    // 5b. Fórmulas derivadas: subquery y columnas calculadas (solo caracteres seguros)
    const safeFormula = (expr: string) => {
      if (!expr || typeof expr !== "string") return null;
      const s = expr.replace(/\s+/g, " ").trim();
      if (!/^[metric_0-9\s\-+*/().,NULLIF]+$/i.test(s)) return null;
      return s;
    };
    if (metricsFormula.length > 0) {
      const formulaSelects = metricsFormula
        .map((m) => {
          const i = body.metrics.indexOf(m);
          const expr = safeFormula(m.formula!);
          if (!expr) return null;
          return `(${expr}) AS "metric_${i}"`;
        })
        .filter(Boolean);
      if (formulaSelects.length > 0)
        query = `SELECT _sub.*, ${formulaSelects.join(", ")} FROM (${query}) AS _sub`;
    }

    // 5c. Acumulados: ventana SUM() OVER (ORDER BY primera dimensión)
    const cumulative = body.cumulative && body.cumulative !== "none" && dimList.length > 0;
    if (cumulative) {
      const orderDim = dimList[0].replace(/"/g, '""');
      const partition =
        body.cumulative === "ytd" && body.dateDimension
          ? `PARTITION BY EXTRACT(YEAR FROM "${body.dateDimension.replace(/"/g, '""')}"::date)`
          : "";
      const windowExpr = body.metrics
        .map((m, i) => {
          const alias = `metric_${i}`;
          return `SUM("${alias}") OVER (${partition} ORDER BY "${orderDim}" ROWS UNBOUNDED PRECEDING) AS "${alias}_cumulative"`;
        })
        .join(", ");
      query = `SELECT *, ${windowExpr} FROM (${query}) AS _cum`;
    }

    // 6. Ejecución
    const { data, error } = await (supabase as any).rpc("execute_sql", {
      sql_query: query,
    });

    if (error) throw new Error(error.message);

    let results = data || [];

    // 6b. Comparación temporal: segundo query período anterior y merge
    if (body.comparePeriod && dimList.length > 0 && body.dateDimension) {
      const dateCol = body.dateDimension.replace(/"/g, '""');
      const now = new Date();
      let prevStart: string;
      let prevEnd: string;
      if (body.comparePeriod === "previous_year") {
        const y = now.getFullYear() - 1;
        prevStart = `${y}-01-01`;
        prevEnd = `${y}-12-31`;
      } else {
        const m = now.getMonth();
        const y = m === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const pm = m === 0 ? 12 : m;
        prevStart = `${y}-${String(pm).padStart(2, "0")}-01`;
        const lastDay = new Date(y, pm, 0).getDate();
        prevEnd = `${y}-${String(pm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      }
      const dateFilter = `"${dateCol}"::date BETWEEN '${prevStart}' AND '${prevEnd}'`;
      const prevWhere = whereClausesStr ? `${dateFilter} AND (${whereClausesStr})` : dateFilter;
      const simplePrevQuery = `SELECT ${dimensionSelectClause}, ${metricClauses} FROM "${schema}"."${table}" WHERE ${prevWhere} GROUP BY ${dimensionGroupByClause}`;
      try {
        const { data: prevData } = await (supabase as any).rpc("execute_sql", {
          sql_query: simplePrevQuery,
        });
        const prevRows = (prevData || []) as Record<string, any>[];
        const prevByDim = new Map<string, Record<string, any>>();
        const dimKey = (r: any) => dimList.map((d) => String(r[d] ?? "")).join("\t");
        prevRows.forEach((r) => prevByDim.set(dimKey(r), r));
        results = results.map((row: any) => {
          const key = dimKey(row);
          const prev = prevByDim.get(key);
          const out = { ...row };
          metricsBase.forEach((m) => {
            const i = body.metrics.indexOf(m);
            const alias = (m as any).internalAlias;
            const v = row[alias] != null ? Number(row[alias]) : null;
            const vPrev = prev?.[alias] != null ? Number(prev[alias]) : null;
            out[`${m.alias || alias}_prev`] = vPrev;
            if (v != null && vPrev != null && vPrev !== 0)
              out[`${m.alias || alias}_var_pct`] = ((v - vPrev) / vPrev) * 100;
            else if (v != null && vPrev != null)
              out[`${m.alias || alias}_var_pct`] = vPrev === 0 ? (v === 0 ? 0 : 100) : null;
          });
          return out;
        });
      } catch (_) {
        // si falla comparación, devolver solo resultados actuales
      }
    }

    // 7. Mapeo final: metric_X -> alias del usuario
    const mappedResults = results.map((row: any) => {
      const newRow = { ...row };

      body.metrics.forEach((m, i) => {
        const internalKey = `metric_${i}`;
        const externalKey = m.alias || `${m.func}(${m.field})`;
        if (Object.prototype.hasOwnProperty.call(newRow, internalKey)) {
          newRow[externalKey] = newRow[internalKey];
          delete newRow[internalKey];
        }
        if (cumulative && Object.prototype.hasOwnProperty.call(newRow, `${internalKey}_cumulative`)) {
          newRow[`${externalKey}_acumulado`] = newRow[`${internalKey}_cumulative`];
          delete newRow[`${internalKey}_cumulative`];
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
