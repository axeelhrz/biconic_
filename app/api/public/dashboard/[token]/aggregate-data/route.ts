import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  coerceGeoComponentOverrides,
  coerceGeoOverridesByXLabel,
  enrichRowsWithGeo,
  type GeoCacheClient,
  type GeoComponentOverrides,
  type GeoHints,
} from "@/lib/geo/geo-enrichment";
import { buildMonthFilterSqlClause } from "@/lib/dashboard/monthFilterSql";
import { expandMonthValueWithYearFromFilters } from "@/lib/dashboard/expandMonthFilterWithYear";
import { buildPgMetricClauses, type MetricClauseMetric } from "@/lib/dashboard/pgAggregateMetricClauses";
import {
  checkBalancedParens,
  expressionToSql,
  FormulaCycleError,
  quotedColumn,
  toSqlLiteral,
  unwrapAggExpression,
} from "@/lib/formula-engine";
import type { DerivedColumnRef } from "@/lib/formula-engine";

// --- Interfaces (alineadas con la ruta interna) ---
interface MetricCondition {
  field: string;
  operator: string;
  value: unknown;
}

interface Metric {
  field: string;
  func: string;
  alias: string;
  cast?: "numeric" | "sanitize";
  condition?: MetricCondition;
  formula?: string;
  expression?: string;
}

interface Filter {
  field: string;
  operator: string;
  value: any;
  cast?: "numeric";
  id?: string;
}

interface OrderBy {
  field: string;
  direction: "ASC" | "DESC";
}

interface AggregationRequest {
  tableName: string;
  dimension?: string;
  dimensions?: string[];
  metrics: Metric[];
  /** Columnas calculadas (mismo shape que aggregate-data interno). */
  derivedColumns?: DerivedColumnRef[];
  /** Definiciones de métricas guardadas para resolver por nombre. */
  savedMetrics?: Array<{ name: string; field?: string; func?: string; alias?: string; expression?: string }>;
  /** Opcional: fuerza el ETL usado para layout (por defecto el del dashboard del token). */
  etlId?: string;
  filters?: Filter[];
  orderBy?: OrderBy;
  limit?: number;
  chartType?: string;
  chartXAxis?: string;
  geoHints?: GeoHints;
  mapDefaultCountry?: string;
  geoComponentOverrides?: GeoComponentOverrides;
  geoOverridesByXLabel?: Record<string, GeoComponentOverrides>;
  dateSlashOrder?: "DMY" | "MDY";
}

const ALLOWED_AGG_FUNCTIONS = [
  "SUM",
  "AVG",
  "COUNT",
  "MIN",
  "MAX",
  "COUNT(DISTINCT",
];

const normalizeStr = (str: string) =>
  str ? str.replace(/\s+/g, "").toUpperCase() : "";

function isInvalidIdentifier(value: unknown): boolean {
  if (value == null) return true;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "" || normalized === "undefined" || normalized === "null";
}

/** Obtiene nombres de columnas de la tabla desde information_schema. Devuelve null si falla o no hay SUPABASE_DB_URL. */
async function fetchTableColumnNames(schemaName: string, tableName: string): Promise<string[] | null> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) return null;
  const safeSchema = schemaName === "etl_output" ? "etl_output" : "public";
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() || "table";
  const sql = postgres(dbUrl);
  try {
    const rows = await sql.unsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      [safeSchema, safeTable]
    ) as Array<{ column_name?: string }>;
    await sql.end();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows.map((r) => String(r?.column_name ?? "").toLowerCase());
  } catch {
    try {
      await sql.end();
    } catch {
      /* ignore */
    }
    return null;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const awaitedParams = await params;
    const token = awaitedParams["token"];
    const body: AggregationRequest = await req.json();
    const requestedChartType = String(body.chartType ?? "").trim().toLowerCase();
    const dateSlashFmt = body.dateSlashOrder === "MDY" ? "MM/DD/YYYY" : "DD/MM/YYYY";

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    if (!body.tableName) {
      throw new Error("Nombre de tabla inválido o no permitido.");
    }

    const supabase = createServiceRoleClient();

    // --- SECURITY CHECK: Validate Table ---
    // 1. Get ETL ID via Token
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
      return NextResponse.json({ error: "Dashboard private" }, { status: 403 });
    }

    // 2. Get Valid Table Name
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
      // Fallback for legacy
      validTable = "public.etl_data_warehouse";
    }

    if (
      body.tableName !== validTable &&
      body.tableName !== "etl_output." + latestRun?.destination_table_name
    ) {
      // Allow some fuzzy matching if necessary (like missing schema), but best to be strict.
      // Internal DashboardViewer sends schema.
      // If mismatch, block.
      // Note: DashboardViewer might send "etl_output.foo" and DB has "etl_output.foo".
      // Use a more robust check?
      // Let's assume strict equality OR check if validTable ends with body.tableName if schema is missing in body?
      // Actually, let's just use strict logic:
      // If `latestRun` exists, we require it to match.
    }

    // Simplification for prototype: If verify fails, 403.
    // However, string comparison can be tricky.
    // Let's rely on standardizing:
    const requested = body.tableName.includes(".")
      ? body.tableName
      : `etl_output.${body.tableName}`;
    const allowed = validTable;

    // allow query if it strictly matches allowed table
    if (requested !== allowed) {
      // Check legacy fallback explicitly
      if (
        requested !== "public.etl_data_warehouse" ||
        allowed !== "public.etl_data_warehouse"
      ) {
        // It's a mismatch
        console.warn(
          `[Public API] Security Block: Requested ${requested} != Allowed ${allowed}`
        );
        return NextResponse.json(
          { error: "Unauthorized table access" },
          { status: 403 }
        );
      }
    }
    // --------------------------------------

    const [schema, table] = requested.split(".");

    // Filtros inteligentes: validar que cada filtro tenga su columna en la tabla; omitir los que no y devolver filterWarnings
    const tableColumnNames = await fetchTableColumnNames(schema, table);
    const tableColumnsSet = tableColumnNames ? new Set(tableColumnNames) : null;
    const filterWarnings: Array<{ filterId?: string; field: string; reason: string }> = [];
    const validFilters: Filter[] = [];
    if (body.filters && body.filters.length > 0) {
      for (const f of body.filters) {
        const fieldNorm = (f.field || "").replace(/"/g, "").trim().toLowerCase();
        if (tableColumnsSet && fieldNorm && !tableColumnsSet.has(fieldNorm)) {
          filterWarnings.push({
            filterId: f.id,
            field: f.field,
            reason: "column_not_in_table",
          });
        } else {
          validFilters.push(f);
        }
      }
    } else {
      validFilters.push(...(body.filters || []));
    }

    if (!Array.isArray(body.metrics) || body.metrics.length === 0) {
      return NextResponse.json({ error: "Se requiere al menos una métrica (metrics)" }, { status: 400 });
    }

    const invalidDimensions = [
      ...(Array.isArray(body.dimensions) ? body.dimensions : []),
      body.dimension,
      body.chartXAxis,
    ].filter((value) => value !== undefined && isInvalidIdentifier(value));
    if (invalidDimensions.length > 0) {
      return NextResponse.json(
        { error: "Hay dimensiones/campos inválidos en la configuración (valor vacío, undefined o null)." },
        { status: 400 }
      );
    }

    for (let i = 0; i < body.metrics.length; i++) {
      const metric = body.metrics[i];
      if (metric.formula) continue;
      if (isInvalidIdentifier(metric.field) && !String(metric.expression ?? "").trim()) {
        return NextResponse.json(
          { error: `Métrica en posición ${i + 1}: field inválido (vacío, undefined o null).` },
          { status: 400 }
        );
      }
    }

    const allowedAggSet = new Set(ALLOWED_AGG_FUNCTIONS.map((f) => f.toUpperCase()));
    const allowedAggWhenExpression = new Set([
      "COUNTIF",
      "SUMIF",
      "COUNTIFS",
      "SUMIFS",
      "AVERAGEIF",
      "MAXIFS",
      "MINIFS",
      "MEDIAN",
      "MODE",
    ]);
    for (let i = 0; i < body.metrics.length; i++) {
      const m = body.metrics[i];
      if (m.formula) continue;
      const func = (m.func || "").toString().toUpperCase().trim();
      const expr = (m as Metric & { expression?: string }).expression?.trim() ?? "";
      const exprIsCountIfSumIf = /^\s*(COUNTIF|SUMIF|COUNTIFS|SUMIFS|AVERAGEIF|MAXIFS|MINIFS)\s*\(/i.test(expr);
      const exprIsMedianMode = /^\s*(MEDIAN|MODE)\s*\(/i.test(expr);
      const allowed =
        allowedAggSet.has(func) ||
        func.startsWith("COUNT(DISTINCT") ||
        func === "COUNTA" ||
        allowedAggWhenExpression.has(func) ||
        exprIsCountIfSumIf ||
        exprIsMedianMode;
      if (!allowed) {
        return NextResponse.json(
          {
            error: `Métrica en posición ${i + 1}: función "${m.func}" no permitida. Use SUM, AVG, COUNT, COUNTA, MIN, MAX, COUNT(DISTINCT), MEDIAN, MODE, o expresiones con COUNTIF/SUMIF/...`,
          },
          { status: 400 }
        );
      }
    }

    const buildWhenClause = (cond: MetricCondition): string => {
      const op = (cond.operator || "=").toUpperCase().trim();
      const f = quotedColumn(cond.field);
      if (op === "IN") {
        const list = (Array.isArray(cond.value) ? cond.value : [cond.value])
          .map((x: unknown) => toSqlLiteral(x))
          .join(", ");
        return `${f} IN (${list})`;
      }
      if ((op === "IS" || op === "IS NOT") && cond.value == null) return `${f} ${op} NULL`;
      return `${f} ${op} ${toSqlLiteral(cond.value)}`;
    };
    const buildConditionExpr = (cond: MetricCondition, thenExpr: string): string =>
      `CASE WHEN ${buildWhenClause(cond)} THEN ${thenExpr} END`;

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

    const etlIdForLookup: string | null = body.etlId ?? dashboard.etl_id ?? null;

    const savedMetricByName: Record<string, { field: string; func: string; alias: string; expression?: string }> = {};
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
          const savedList = Array.isArray(layout?.saved_metrics) ? layout.saved_metrics : [];
          for (const sm of savedList) {
            const s = sm as {
              name?: string;
              metric?: { field?: string; func?: string; alias?: string; expression?: string };
              aggregationConfig?: { metrics?: { field?: string; func?: string; alias?: string; expression?: string }[] };
            };
            const name = String(s?.name ?? "").trim().toLowerCase();
            if (!name) continue;
            const topMetric = s?.metric;
            const cfgMetrics = s?.aggregationConfig?.metrics;
            const firstMetric = Array.isArray(cfgMetrics) && cfgMetrics.length > 0 ? cfgMetrics[0] : topMetric;
            if (!firstMetric) continue;
            let field = String(firstMetric?.field ?? "").trim();
            const expression = (firstMetric as { expression?: string }).expression;
            const alias = String(firstMetric?.alias ?? name);
            if (field.toLowerCase() === name && !expression) {
              const byAlias =
                Array.isArray(cfgMetrics) && cfgMetrics.length > 0
                  ? cfgMetrics.find((mm: { field?: string }) => mm?.field && String(mm.field).trim().toLowerCase() !== name)
                  : null;
              if (byAlias) {
                field = String((byAlias as { field?: string }).field ?? "").trim();
              } else {
                field = alias;
              }
              if (!field || field.toLowerCase() === name) {
                const agg = s?.aggregationConfig as
                  | { dimension?: string; dimension2?: string; dimensions?: string[] }
                  | undefined;
                const dim =
                  (agg?.dimension && String(agg.dimension).trim()) ||
                  (agg?.dimension2 && String(agg.dimension2).trim()) ||
                  (Array.isArray(agg?.dimensions) && agg.dimensions[0] && String(agg.dimensions[0]).trim()) ||
                  "";
                if (dim && dim.toLowerCase() !== name) field = dim;
              }
            }
            savedMetricByName[name] = {
              field,
              func: String(firstMetric?.func ?? "SUM").toUpperCase(),
              alias,
              ...(expression && String(expression).trim() && { expression: String(expression).trim() }),
            };
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (Array.isArray(body.savedMetrics) && body.savedMetrics.length > 0) {
      for (const sm of body.savedMetrics) {
        const name = typeof sm?.name === "string" ? String(sm.name).trim() : "";
        if (!name) continue;
        const key = name.toLowerCase();
        const field = typeof sm.field === "string" ? String(sm.field).trim() : "";
        const func = typeof sm.func === "string" ? String(sm.func).toUpperCase() : "SUM";
        const alias = typeof sm.alias === "string" ? String(sm.alias).trim() : name;
        const expression = typeof sm.expression === "string" ? String(sm.expression).trim() : undefined;
        savedMetricByName[key] = {
          field: field || name,
          func,
          alias: alias || name,
          ...(expression ? { expression } : {}),
        };
      }
    }

    const exprToSql = (e: string): string | null => {
      try {
        return expressionToSql(e, derivedByName);
      } catch (err) {
        if (err instanceof FormulaCycleError) return null;
        throw err;
      }
    };

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
      let expr = metricExpr && metricExpr.trim() ? metricExpr.trim() : (derived?.expression ?? null);
      if (expr) {
        const uw = unwrapAggExpression(expr);
        if (uw) expr = uw.inner;
      }
      if (expr != null && String(expr).trim() !== "") {
        const exprStr = String(expr).trim();
        const parenError = checkBalancedParens(exprStr);
        if (parenError) {
          return NextResponse.json({ error: `Métrica en posición ${i + 1}: ${parenError}` }, { status: 400 });
        }
        try {
          expressionToSql(exprStr, derivedByName);
        } catch (err) {
          if (err instanceof FormulaCycleError) {
            return NextResponse.json({ error: `Métrica en posición ${i + 1}: ${err.message}` }, { status: 400 });
          }
          throw err;
        }
        const parsedExpr = expressionToSql(exprStr, derivedByName);
        if (!parsedExpr) {
          return NextResponse.json(
            {
              error: `Métrica en posición ${i + 1}: la expresión no es válida. Revisá columnas del dataset, operadores (* - + / ^ & ) y funciones soportadas.`,
            },
            { status: 400 }
          );
        }
      } else if (!m.field || !String(m.field).trim()) {
        return NextResponse.json(
          { error: `Métrica en posición ${i + 1}: indicá una expresión o un campo.` },
          { status: 400 }
        );
      }
    }

    const { metricClauses, ratioAggregateError } = buildPgMetricClauses({
      bodyMetrics: body.metrics as MetricClauseMetric[],
      metricsBase: metricsBase as MetricClauseMetric[],
      derivedByName,
      savedMetricByName,
      getDerived,
      exprToSql,
      buildWhenClause,
      buildConditionExpr,
    });

    if (ratioAggregateError) {
      return NextResponse.json(
        {
          error:
            "No se puede usar una expresión que sea «agregado / agregado» (ej. sum(...)/count(...)) como una sola métrica. Creá dos métricas y luego una fórmula con metric_0 / NULLIF(metric_1, 0).",
        },
        { status: 400 }
      );
    }

    const dimList =
      Array.isArray(body.dimensions) && body.dimensions.length > 0
        ? body.dimensions.filter((d) => !isInvalidIdentifier(d))
        : body.dimension && !isInvalidIdentifier(body.dimension)
          ? [body.dimension]
          : [];
    let dimDerivedError: string | null = null;
    const dimExprSql = (d: string): string => {
      const derived = getDerived(d);
      if (!derived?.expression) return quotedColumn(d);
      const parsed = exprToSql(derived.expression);
      if (!parsed) {
        dimDerivedError = `La dimensión calculada «${d}» no pudo expandirse a SQL. Revisá su fórmula.`;
        return quotedColumn(d);
      }
      return `(${parsed})`;
    };
    let dimensionSelectClause = "";
    let dimensionGroupByClause = "";

    if (dimList.length > 0) {
      const parts = dimList.map((d) => {
        const col = dimExprSql(d);
        const alias = (d || "").trim().replace(/"/g, '""');
        const coalesceExpression = `COALESCE(${col}::text, 'Sin Categoría')`;
        return { select: `${coalesceExpression} AS "${alias}"`, group: coalesceExpression };
      });
      dimensionSelectClause = parts.map((p) => p.select).join(", ");
      dimensionGroupByClause = parts.map((p) => p.group).join(", ");
    }
    if (dimDerivedError) {
      return NextResponse.json({ error: dimDerivedError }, { status: 400 });
    }

    const selectClause = [dimensionSelectClause, metricClauses].filter(Boolean).join(", ");
    if (!selectClause.trim()) {
      return NextResponse.json(
        { error: "La consulta debe incluir al menos una dimensión o una métrica base (no solo fórmulas sobre métricas vacías)." },
        { status: 400 }
      );
    }
    let query = `SELECT ${selectClause} FROM "${schema}"."${table}"`;

    // 3. Filtros
    if (validFilters.length > 0) {
      const whereClauses = validFilters
        .map((f) => {
          const safeField = f.field.replace(/"/g, '""');
          const op = (f.operator || "=").toUpperCase().trim();

          let fieldExpression;
          if (op === "MONTH" || op === "DAY" || op === "YEAR" || op === "QUARTER" || op === "SEMESTER" || op === "YEAR_MONTH") {
            fieldExpression = `(
              CASE
                WHEN "${safeField}"::text ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date("${safeField}"::text, '${dateSlashFmt}')
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
            const monthVal = expandMonthValueWithYearFromFilters(f.field, f.value, validFilters);
            return buildMonthFilterSqlClause(fieldExpression, monthVal);
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
          if (op === "QUARTER") {
            if (Array.isArray(f.value)) {
              const list = f.value
                .map((v) => Number(v))
                .filter((n) => !isNaN(n) && n >= 1 && n <= 4)
                .join(", ");
              if (!list) return "TRUE";
              return `EXTRACT(QUARTER FROM ${fieldExpression}) IN (${list})`;
            }
            const q = Number(f.value);
            if (isNaN(q) || q < 1 || q > 4) return "TRUE";
            return `EXTRACT(QUARTER FROM ${fieldExpression}) = ${q}`;
          }
          if (op === "SEMESTER") {
            const semExpr = `(CASE WHEN EXTRACT(MONTH FROM ${fieldExpression}) <= 6 THEN 1 ELSE 2 END)`;
            if (Array.isArray(f.value)) {
              const list = f.value
                .map((v) => Number(v))
                .filter((n) => !isNaN(n) && (n === 1 || n === 2))
                .join(", ");
              if (!list) return "TRUE";
              return `${semExpr} IN (${list})`;
            }
            const s = Number(f.value);
            if (isNaN(s) || (s !== 1 && s !== 2)) return "TRUE";
            return `${semExpr} = ${s}`;
          }
          if (op === "YEAR_MONTH") {
            return buildMonthFilterSqlClause(fieldExpression, f.value);
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

    // 4b. Fórmulas sobre métricas (metric_n), mismo criterio que la API interna
    const aliasToMetricRef: { alias: string; ref: string }[] = body.metrics
      .map((m, idx) => ({ alias: (m.alias || "").trim(), ref: `metric_${idx}` }))
      .filter((x) => x.alias.length > 0)
      .sort((a, b) => b.alias.length - a.alias.length);
    const resolveAliasesInFormula = (formula: string): string => {
      let s = formula.replace(/\s+/g, " ").trim();
      for (const { alias, ref } of aliasToMetricRef) {
        if (alias && s.includes(alias)) s = s.split(alias).join(ref);
      }
      return s;
    };
    const safeFormula = (expr: string) => {
      if (!expr || typeof expr !== "string") return null;
      const withAliases = resolveAliasesInFormula(expr);
      const s = withAliases.replace(/\s+/g, " ").trim();
      if (!/^[\w\s\-+*/().,&]+$/i.test(s)) return null;
      return s;
    };
    const findMetricRefsInFormula = (expr: string): number[] => {
      const refs: number[] = [];
      const re = /metric_(\d+)\b/gi;
      let match: RegExpExecArray | null;
      while ((match = re.exec(expr)) != null) {
        const idx = Number.parseInt(match[1] ?? "", 10);
        if (Number.isFinite(idx)) refs.push(idx);
      }
      return refs;
    };
    if (metricsFormula.length > 0) {
      const maxMetricIndex = body.metrics.length - 1;
      for (const m of metricsFormula) {
        const expr = safeFormula(m.formula!);
        if (!expr) {
          return NextResponse.json(
            { error: `Fórmula inválida en la métrica «${m.alias || "sin nombre"}». Revisá la sintaxis.` },
            { status: 400 }
          );
        }
        const outOfRangeRef = findMetricRefsInFormula(expr).find((idx) => idx < 0 || idx > maxMetricIndex);
        if (outOfRangeRef != null) {
          return NextResponse.json(
            {
              error: `La fórmula de «${m.alias || "sin nombre"}» referencia metric_${outOfRangeRef}, pero solo existen métricas hasta metric_${maxMetricIndex}.`,
            },
            { status: 400 }
          );
        }
      }
      const formulaSelects = metricsFormula
        .map((m) => {
          const i = body.metrics.indexOf(m);
          const expr = safeFormula(m.formula!);
          if (!expr) return null;
          return `(${expr}) AS "metric_${i}"`;
        })
        .filter(Boolean);
      if (formulaSelects.length > 0) {
        query = `SELECT _sub.*, ${formulaSelects.join(", ")} FROM (${query}) AS _sub`;
      }
    }

    // 5. Order By
    if (body.orderBy?.field) {
      const dir = (body.orderBy.direction || "DESC").toString().toUpperCase();
      const safeDir = dir === "ASC" ? "ASC" : "DESC";
      let orderByField = `"${body.orderBy.field.replace(/"/g, '""')}"`;
      const requestedSortNormalized = normalizeStr(body.orderBy.field);
      const dimMatch = dimList.find((d) => normalizeStr(d) === requestedSortNormalized);
      if (dimMatch) {
        orderByField = `"${dimMatch.replace(/"/g, '""')}"`;
      } else {
        const metricIdxMatch = /^metric_(\d+)$/i.exec(String(body.orderBy.field || "").trim());
        let orderByInternal: string | undefined;
        if (metricIdxMatch) {
          const idx = parseInt(metricIdxMatch[1]!, 10);
          if (Number.isFinite(idx) && idx >= 0 && idx < body.metrics.length) {
            const ia = (body.metrics[idx] as { internalAlias?: string }).internalAlias;
            if (typeof ia === "string" && ia.trim() !== "") orderByInternal = ia;
          }
        }
        if (orderByInternal) {
          orderByField = `"${orderByInternal.replace(/"/g, '""')}"`;
        } else {
          const matchedMetric = body.metrics.find((m) => {
            const sig = `${m.func}(${m.field})`;
            return (
              requestedSortNormalized === normalizeStr(m.alias || "") ||
              requestedSortNormalized === normalizeStr(sig)
            );
          });
          if (matchedMetric && (matchedMetric as { internalAlias?: string }).internalAlias) {
            orderByField = `"${String((matchedMetric as { internalAlias?: string }).internalAlias).replace(/"/g, '""')}"`;
          }
        }
      }
      query += ` ORDER BY ${orderByField} ${safeDir}`;
    }

    if (body.limit) {
      const lim = Math.max(1, Math.min(5000, parseInt(String(body.limit), 10)));
      query += ` LIMIT ${lim}`;
    }

    // 6. Ejecución via RPC (using service role)
    const { data, error } = await (supabase as any).rpc("execute_sql", {
      sql_query: query,
    });

    if (error) throw new Error(error.message);

    const results = data || [];

    const mappedResults = results.map((row: any) => {
      const newRow = { ...row };
      body.metrics.forEach((m, i) => {
        const internalKey = `metric_${i}`;
        const externalKey = m.alias ? m.alias : `${m.func}(${m.field})`;
        if (Object.prototype.hasOwnProperty.call(newRow, internalKey)) {
          newRow[externalKey] = newRow[internalKey];
          delete newRow[internalKey];
        }
      });
      return newRow;
    });

    const shouldEnrichGeo =
      requestedChartType === "map" ||
      /\b(lat|lon|lng|geo|country|pais|ciudad|city|localidad|provincia|estado)\b/i.test(dimList.join(" "));
    const geoReadyRows = shouldEnrichGeo
      ? await enrichRowsWithGeo({
          rows: mappedResults as Record<string, unknown>[],
          dimList,
          chartXAxis: body.chartXAxis ?? body.dimension ?? body.dimensions?.[0],
          geoHints: body.geoHints,
          mapDefaultCountry: typeof body.mapDefaultCountry === "string" ? body.mapDefaultCountry : undefined,
          geoComponentOverrides: coerceGeoComponentOverrides(body.geoComponentOverrides),
          geoOverridesByXLabel: coerceGeoOverridesByXLabel(body.geoOverridesByXLabel),
          cacheClient: supabase as unknown as GeoCacheClient,
        })
      : mappedResults;

    if (filterWarnings.length > 0) {
      return NextResponse.json({ rows: geoReadyRows, filterWarnings });
    }
    return NextResponse.json(geoReadyRows);
  } catch (err: any) {
    console.error("Error en API:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
