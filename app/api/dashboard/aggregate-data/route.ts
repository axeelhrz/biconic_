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
  /** Expresión sobre columnas de la tabla (ej. "CANTIDAD * PRECIO_UNITARIO"). Se agrega con func (SUM, AVG...). Permite * - + / ( ) y nombres de columna. */
  expression?: string;
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

/** En Postgres los identificadores sin comillas se guardan en minúsculas; normalizar para que "ID" coincida con "id". */
function quotedColumn(name: string): string {
  const s = (name || "").trim().replace(/"/g, '""').toLowerCase();
  return s ? `"${s}"` : '""';
}

/** Convierte expresión sobre columnas (ej. "CANTIDAD * PRECIO_UNITARIO") en SQL seguro: cada identificador se pasa a quotedColumn. */
function expressionToSql(expression: string): string | null {
  if (!expression || typeof expression !== "string") return null;
  const s = expression.replace(/\s+/g, " ").trim();
  if (!s) return null;
  const allowed = /^[a-zA-Z0-9_*+\-/().\s]+$/;
  if (!allowed.test(s)) return null;
  const out = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (_, id) => quotedColumn(id));
  return out || null;
}

export async function POST(req: NextRequest) {
  try {
    let body: AggregationRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Cuerpo de la petición inválido (JSON esperado)" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Cuerpo de la petición inválido" },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.metrics) || body.metrics.length === 0) {
      return NextResponse.json(
        { error: "Se requiere al menos una métrica (metrics)" },
        { status: 400 }
      );
    }

    // Validar que cada métrica base use una función de agregación permitida
    const allowedAggSet = new Set(ALLOWED_AGG_FUNCTIONS.map((f) => f.toUpperCase()));
    for (let i = 0; i < body.metrics.length; i++) {
      const m = body.metrics[i];
      if (m.formula) continue;
      const func = (m.func || "").toString().toUpperCase().trim();
      const allowed =
        allowedAggSet.has(func) ||
        func.startsWith("COUNT(DISTINCT");
      if (!allowed) {
        return NextResponse.json(
          { error: `Métrica en posición ${i + 1}: función "${m.func}" no permitida. Use: SUM, AVG, COUNT, MIN, MAX, COUNT(DISTINCT).` },
          { status: 400 }
        );
      }
    }

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

    // Permitir etl_output.* y public.* (legacy etl_data_warehouse u otras tablas)
    const allowedPrefixes = ["etl_output.", "public."];
    if (!body.tableName || typeof body.tableName !== "string" || !allowedPrefixes.some((p) => body.tableName.startsWith(p))) {
      return NextResponse.json(
        { error: "Nombre de tabla inválido o no permitido. Use esquema etl_output o public." },
        { status: 400 }
      );
    }

    // Soporte para nombres de tabla con punto: solo dividir en el primer "."
    const dotIdx = body.tableName.indexOf(".");
    const schema = body.tableName.substring(0, dotIdx);
    const table = body.tableName.substring(dotIdx + 1);
    if (!table) {
      return NextResponse.json(
        { error: "Formato de tabla inválido (debe ser esquema.nombre_tabla)" },
        { status: 400 }
      );
    }

    // Helper: condición WHEN para métrica (solo la parte "campo op valor")
    const buildWhenClause = (cond: MetricCondition): string => {
      const op = (cond.operator || "=").toUpperCase().trim();
      const f = quotedColumn(cond.field);
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

    for (let i = 0; i < metricsBase.length; i++) {
      const m = metricsBase[i];
      const expr = (m as Metric & { expression?: string }).expression;
      if (expr != null && expr.trim() !== "") {
        if (!expressionToSql(expr.trim())) {
          return NextResponse.json(
            { error: `Métrica en posición ${i + 1}: la expresión solo puede contener nombres de columna y operadores * - + / ( ).` },
            { status: 400 }
          );
        }
      } else if (!m.field || !String(m.field).trim()) {
        return NextResponse.json(
          { error: `Métrica en posición ${i + 1}: indicá una expresión (ej. CANTIDAD * PRECIO_UNITARIO) o un campo.` },
          { status: 400 }
        );
      }
    }

    // 1. Construcción de Métricas (condicionales y estándar; fórmulas después)
    const metricClauses = metricsBase
      .map((m) => {
        const i = body.metrics.indexOf(m);
        const func = m.func.toUpperCase();
        const exprOverColumns = (m as Metric & { expression?: string }).expression;
        const fieldExpr = (() => {
          if (exprOverColumns) {
            const sqlExpr = expressionToSql(exprOverColumns);
            if (sqlExpr) return `(${sqlExpr})::numeric`;
          }
          const col = quotedColumn(m.field);
          if (m.cast === "sanitize")
            return `regexp_replace(${col}::text, '[^0-9\\.-]', '', 'g')::numeric`;
          if (m.cast === "numeric") return `${col}::numeric`;
          return col;
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
        const col = quotedColumn(d);
        const alias = (d || "").trim().replace(/"/g, '""');
        return `COALESCE(${col}::text, 'Sin Categoría') AS "${alias}"`;
      });
      dimensionSelectClause = parts.join(", ");
      dimensionGroupByClause = dimList
        .map((d) => `COALESCE(${quotedColumn(d)}::text, 'Sin Categoría')`)
        .join(", ");
    }

    const selectClause = [dimensionSelectClause, metricClauses]
      .filter(Boolean)
      .join(", ");
    if (!selectClause.trim()) {
      return NextResponse.json(
        { error: "La consulta debe incluir al menos una dimensión o una métrica base (no solo fórmulas)." },
        { status: 400 }
      );
    }
    let query = `SELECT ${selectClause} FROM "${schema}"."${table}"`;

    // 3. Filtros
    let whereClausesStr = "";
    if (body.filters && body.filters.length > 0) {
      const whereClauses = body.filters
        .map((f) => {
          const col = quotedColumn(f.field);
          const op = (f.operator || "=").toUpperCase().trim();

          let fieldExpression;
          if (op === "MONTH" || op === "DAY" || op === "YEAR") {
            fieldExpression = `(
              CASE
                WHEN ${col}::text ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(${col}::text, 'DD/MM/YYYY')
                WHEN ${col}::text LIKE '%, % de % de %' THEN to_date(${col}::text, 'Day, DD "de" Month "de" YYYY')
                ELSE ${col}::date
              END
            )`;
          } else {
            fieldExpression =
              f.cast === "numeric"
                ? `${col}::numeric`
                : col;
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
            return `${col} ${op} NULL`;

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
    if (body.orderBy?.field) {
      const dir = (body.orderBy.direction || "DESC").toString().toUpperCase();
      const safeDir = dir === "ASC" ? "ASC" : "DESC";
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
      query += ` ORDER BY ${orderByField} ${safeDir}`;
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

    if (error) {
      const msg = error.message || String(error);
      console.error("[aggregate-data] execute_sql error:", msg, "Query:", query.slice(0, 200));
      return NextResponse.json(
        { error: "Error al ejecutar la agregación: " + msg },
        { status: 500 }
      );
    }

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
    const message = err?.message ?? String(err);
    console.error("[aggregate-data] Error:", message, err);
    return NextResponse.json(
      { error: "Error en agregación: " + message },
      { status: 500 }
    );
  }
}
