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

/** Columna calculada (nombre + expresión sobre columnas + agregación por defecto). */
interface DerivedColumnRef {
  name: string;
  expression: string;
  defaultAggregation: string;
}

interface AggregationRequest {
  tableName: string;
  dimension?: string;
  /** Múltiples dimensiones (ej. mes + categoría). Se hace GROUP BY todas. */
  dimensions?: string[];
  metrics: Metric[];
  /** Columnas calculadas enviadas por el cliente. Se fusionan con las de la DB. */
  derivedColumns?: DerivedColumnRef[];
  /** ID del ETL para resolver columnas calculadas desde la DB (fallback automático). */
  etlId?: string;
  filters?: Filter[];
  orderBy?: OrderBy;
  limit?: number;
  cumulative?: "none" | "running_sum" | "ytd";
  comparePeriod?: "previous_year" | "previous_month";
  dateDimension?: string;
  /** Agrupación temporal: aplica DATE_TRUNC(granularity, campo) como primera dimensión. */
  dateGroupBy?: { field: string; granularity: "day" | "week" | "month" | "year" };
  /** Filtro de rango temporal: WHERE campo >= CURRENT_DATE - INTERVAL 'N unit'. */
  dateRangeFilter?: { field: string; last: number; unit: "days" | "months" };
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

const SQL_KNOWN_FUNCTIONS = new Set(["SUM", "AVG", "COUNT", "MIN", "MAX", "NULLIF", "COALESCE", "ABS", "ROUND", "CEIL", "FLOOR", "GREATEST", "LEAST"]);

/** Convierte expresión sobre columnas (ej. "CANTIDAD * PRECIO_UNITARIO") en SQL seguro.
 *  - Funciones SQL conocidas se preservan.
 *  - Nombres de columnas calculadas (derivedLookup) se expanden a su expresión.
 *  - Demás identificadores se pasan a quotedColumn.
 */
function expressionToSql(expression: string, derivedLookup?: Record<string, DerivedColumnRef>, _depth = 0): string | null {
  if (!expression || typeof expression !== "string") return null;
  const s = expression.replace(/\s+/g, " ").trim();
  if (!s) return null;
  const allowed = /^[a-zA-Z0-9_*+\-/().,\s]+$/;
  if (!allowed.test(s)) return null;
  const out = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (_, id: string) => {
    if (SQL_KNOWN_FUNCTIONS.has(id.toUpperCase())) return id.toUpperCase();
    if (derivedLookup && _depth < 5) {
      const ref = derivedLookup[id.toLowerCase()];
      if (ref?.expression) {
        const inner = expressionToSql(ref.expression, derivedLookup, _depth + 1);
        if (inner) return `(${inner})`;
      }
    }
    return quotedColumn(id);
  });
  return out || null;
}

/** Si la expresión está envuelta en una función de agregación (ej. "SUM(X * Y)"), devuelve { func, inner }. */
function unwrapAggExpression(expr: string): { func: string; inner: string } | null {
  const m = expr.trim().match(/^(SUM|AVG|COUNT|MIN|MAX)\s*\((.+)\)\s*$/i);
  if (!m) return null;
  return { func: m[1]!.toUpperCase(), inner: m[2]!.trim() };
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

    // --- Resolver columnas derivadas: fusionar las del request con las de la DB ---
    const derivedByName: Record<string, DerivedColumnRef> = {};

    const addDerivedFromArray = (arr: unknown[]) => {
      for (const d of arr) {
        const item = d as Record<string, unknown>;
        const name = String(item?.name ?? "").trim();
        const expression = String(item?.expression ?? "").trim();
        if (!name || !expression) continue;
        const key = name.toLowerCase();
        if (!derivedByName[key]) {
          derivedByName[key] = {
            name,
            expression,
            defaultAggregation: String(item?.defaultAggregation ?? item?.default_aggregation ?? "SUM"),
          };
        }
      }
    };

    if (Array.isArray(body.derivedColumns)) addDerivedFromArray(body.derivedColumns);

    // Buscar en la DB: por etlId explícito, por output_table, o por etl_runs_log
    let etlIdForLookup: string | null = body.etlId ?? null;
    if (!etlIdForLookup && table) {
      const tbl = table.toLowerCase();
      try {
        const { data: etlByOutput } = await supabase
          .from("etl")
          .select("id")
          .ilike("output_table", tbl)
          .limit(1)
          .maybeSingle();
        if (etlByOutput?.id) etlIdForLookup = etlByOutput.id;
      } catch { /* ignore */ }
      if (!etlIdForLookup) {
        try {
          const { data: runRow } = await supabase
            .from("etl_runs_log")
            .select("etl_id")
            .eq("status", "completed")
            .ilike("destination_table_name", tbl)
            .order("completed_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (runRow?.etl_id) etlIdForLookup = runRow.etl_id;
        } catch { /* ignore */ }
      }
    }
    if (etlIdForLookup) {
      try {
        const { data: etlRow } = await supabase
          .from("etl")
          .select("layout")
          .eq("id", etlIdForLookup)
          .maybeSingle();
        if (etlRow) {
          const layout = etlRow.layout as Record<string, unknown> | undefined;
          const cfg = (layout?.dataset_config ?? layout?.datasetConfig) as Record<string, unknown> | undefined;
          const raw = cfg?.derivedColumns ?? cfg?.derived_columns;
          if (Array.isArray(raw)) addDerivedFromArray(raw);
        }
      } catch { /* ignore */ }
    }
    console.log("[aggregate-data] derivedByName keys:", Object.keys(derivedByName), "etlIdForLookup:", etlIdForLookup);

    const getDerived = (field: string | undefined): DerivedColumnRef | undefined => {
      if (!field || !String(field).trim()) return undefined;
      return derivedByName[String(field).trim().toLowerCase()];
    };

    const metricsBase = body.metrics.filter((m) => !m.formula);
    const metricsFormula = body.metrics.filter((m) => m.formula);

    for (let i = 0; i < metricsBase.length; i++) {
      const m = metricsBase[i];
      const derived: DerivedColumnRef | undefined = getDerived(m.field);
      const metricExpr = (m as Metric & { expression?: string }).expression;
      let expr = (metricExpr && metricExpr.trim()) ? metricExpr.trim() : (derived?.expression ?? null);
      if (expr) {
        const uw = unwrapAggExpression(expr);
        if (uw) expr = uw.inner;
      }
      if (expr != null && String(expr).trim() !== "") {
        if (!expressionToSql(String(expr).trim(), derivedByName)) {
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
      } else if (!derived) {
        // field existe pero no es columna calculada: se usará como columna real
      }
    }

    // 1. Construcción de Métricas. Columnas calculadas: field -> expression + func.
    const metricClauses = metricsBase
      .map((m) => {
        const i = body.metrics.indexOf(m);
        const derived: DerivedColumnRef | undefined = getDerived(m.field);

        // Resolver expresión: prioridad derived > metric.expression (defensivo)
        let resolvedExpr = "";
        if (derived) {
          resolvedExpr = derived.expression;
        }
        const metricExpr = (m as Metric & { expression?: string }).expression;
        if (metricExpr && metricExpr.trim()) {
          resolvedExpr = metricExpr.trim();
        }

        // Si está envuelta en agregación, extraer
        let func = (m.func || derived?.defaultAggregation || "SUM").toString().toUpperCase();
        if (resolvedExpr) {
          const unwrapped = unwrapAggExpression(resolvedExpr);
          if (unwrapped) {
            resolvedExpr = unwrapped.inner;
            if (!m.func || m.func === "SUM") func = unwrapped.func;
          }
        }

        const fieldExpr = (() => {
          if (resolvedExpr) {
            const sqlExpr = expressionToSql(resolvedExpr, derivedByName);
            if (sqlExpr) return `(${sqlExpr})::numeric`;
            console.warn("[aggregate-data] expressionToSql returned null for:", resolvedExpr);
          }
          if (derived) {
            console.warn("[aggregate-data] FALLTHROUGH: derived col", m.field, "expr:", derived.expression, "resolvedExpr:", resolvedExpr);
          }
          const col = quotedColumn(m.field!);
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

    // 2. Dimensiones (una o varias) + dateGroupBy (DATE_TRUNC)
    const dimList = (body.dimensions && body.dimensions.length > 0)
      ? body.dimensions
      : body.dimension
        ? [body.dimension]
        : [];
    let dimensionSelectClause = "";
    let dimensionGroupByClause = "";
    let dateGroupByExpr = "";

    if (body.dateGroupBy?.field && body.dateGroupBy?.granularity) {
      const dgCol = quotedColumn(body.dateGroupBy.field);
      const gran = body.dateGroupBy.granularity.toLowerCase().replace(/[^a-z]/g, "");
      const validGran = ["day", "week", "month", "year"].includes(gran) ? gran : "month";
      dateGroupByExpr = `DATE_TRUNC('${validGran}', ${dgCol}::timestamp)`;
      const dateParts = [`${dateGroupByExpr}::text AS "periodo"`];
      if (dimList.length > 0) {
        dateParts.push(
          ...dimList.map((d) => {
            const col = quotedColumn(d);
            const alias = (d || "").trim().replace(/"/g, '""');
            return `COALESCE(${col}::text, 'Sin Categoría') AS "${alias}"`;
          })
        );
      }
      dimensionSelectClause = dateParts.join(", ");
      const groupParts = [dateGroupByExpr];
      if (dimList.length > 0) {
        groupParts.push(
          ...dimList.map((d) => `COALESCE(${quotedColumn(d)}::text, 'Sin Categoría')`)
        );
      }
      dimensionGroupByClause = groupParts.join(", ");
    } else if (dimList.length > 0) {
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

    // 3. Filtros (dateRangeFilter primero, luego los del usuario)
    let whereClausesStr = "";
    const dateRangeClause = (() => {
      if (!body.dateRangeFilter?.field || !body.dateRangeFilter?.last) return "";
      const drCol = quotedColumn(body.dateRangeFilter.field);
      const n = Math.max(1, Math.min(9999, Math.round(body.dateRangeFilter.last)));
      const unit = body.dateRangeFilter.unit === "days" ? "days" : "months";
      return `${drCol}::date >= (CURRENT_DATE - INTERVAL '${n} ${unit}')`;
    })();

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
    }
    const allWhere = [dateRangeClause, whereClausesStr].filter(Boolean).join(" AND ");
    if (allWhere) query += ` WHERE ${allWhere}`;

    // 4. Group By
    if (dimensionGroupByClause) {
      query += ` GROUP BY ${dimensionGroupByClause}`;
    }

    // 5. Order By (dimensión o métrica por alias interno; dateGroupBy ordena por periodo ASC por defecto)
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
    } else if (dateGroupByExpr) {
      query += ` ORDER BY ${dateGroupByExpr} ASC`;
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
    console.log("[aggregate-data] query:", query.slice(0, 300), "| derivedKeys:", Object.keys(derivedByName));
    const { data, error } = await (supabase as any).rpc("execute_sql", {
      sql_query: query,
    });

    if (error) {
      const msg = error.message || String(error);
      console.error("[aggregate-data] execute_sql error:", msg, "Query:", query.slice(0, 500), "derivedByName:", JSON.stringify(derivedByName));
      let userMsg = "Error al ejecutar la agregación: " + msg;
      if (/column\s+["']?(\w+)["']?\s+does not exist/i.test(msg)) {
        const colMatch = msg.match(/column\s+["']?(\w+)["']?\s+does not exist/i);
        const colName = colMatch ? colMatch[1] : "";
        const isDerived = derivedByName[colName.toLowerCase()];
        if (isDerived) {
          userMsg = `Error interno: la columna «${colName}» fue encontrada como derivada (expr: ${isDerived.expression}) pero el SQL generado no la expandió. Contactá soporte.`;
        } else {
          const availableDerived = Object.keys(derivedByName).join(", ") || "(ninguna)";
          userMsg = `La columna «${colName}» no existe en la tabla ni como columna calculada. Columnas calculadas disponibles: ${availableDerived}. Creala en Métricas → Fórmula → Crear columna.`;
        }
      }
      return NextResponse.json(
        { error: userMsg },
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
