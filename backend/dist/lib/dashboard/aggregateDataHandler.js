"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAggregateData = runAggregateData;
const postgres_1 = __importDefault(require("postgres"));
const internal_db_url_1 = require("../db/internal-db-url");
const dateFormatting_1 = require("./dateFormatting");
const monthFilterSql_1 = require("./monthFilterSql");
const expandMonthFilterWithYear_1 = require("./expandMonthFilterWithYear");
const geo_enrichment_1 = require("../geo/geo-enrichment");
const compareSpec_1 = require("./compareSpec");
const compareMetricRows_1 = require("./compareMetricRows");
const compareDisplayKeys_1 = require("./compareDisplayKeys");
const expandAggregationFiltersForCompare_1 = require("./expandAggregationFiltersForCompare");
const coerceNumericSqlExpr_1 = require("./coerceNumericSqlExpr");
const metricExpressionToSql_1 = require("./metricExpressionToSql");
const toSqlLiteral_1 = require("./toSqlLiteral");
function jsonResponse(data, init) {
    return { status: init?.status ?? 200, data };
}
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
    "QUARTER",
    "SEMESTER",
    "EXACT",
    "CONTAINS",
    "STARTS_WITH",
    "ENDS_WITH",
    "YEAR_MONTH",
]);
async function fetchTableColumnNames(schemaName, tableName, dbUrl) {
    const resolvedUrl = dbUrl ?? (0, internal_db_url_1.getInternalDbUrl)();
    if (!resolvedUrl)
        return null;
    const safeSchema = schemaName === "etl_output" ? "etl_output" : "public";
    const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() || "table";
    const sql = (0, postgres_1.default)(resolvedUrl);
    try {
        const rows = await sql.unsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [safeSchema, safeTable]);
        await sql.end();
        if (!Array.isArray(rows) || rows.length === 0)
            return null;
        return rows.map((r) => String(r?.column_name ?? "").toLowerCase());
    }
    catch {
        try {
            await sql.end();
        }
        catch {
        }
        return null;
    }
}
function isYearLike(value) {
    if (value == null)
        return false;
    if (Array.isArray(value))
        return value.length > 0 && value.every((v) => isYearLike(v));
    const s = String(value).trim();
    if (!/^\d{4}$/.test(s))
        return false;
    const n = Number(s);
    return Number.isFinite(n) && n >= 1900 && n <= 2100;
}
const normalizeStr = (str) => str ? str.replace(/\s+/g, "").toUpperCase() : "";
function isInvalidIdentifier(value) {
    if (value == null)
        return true;
    const normalized = String(value).trim().toLowerCase();
    return normalized === "" || normalized === "undefined" || normalized === "null";
}
function safeDateCast(expr, slashOrder) {
    const e = expr.trim();
    const slashFmt = slashOrder === "MDY" ? "MM/DD/YYYY" : "DD/MM/YYYY";
    return `(
    CASE
      WHEN ${e} IS NULL THEN NULL
      WHEN trim((${e})::text) ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(trim((${e})::text), '${slashFmt}')
      WHEN trim((${e})::text) ~ '^\\d{1,2}-\\d{1,2}-\\d{4}$' THEN to_date(trim((${e})::text), 'DD-MM-YYYY')
      WHEN trim((${e})::text) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN to_date(trim((${e})::text), 'YYYY-MM-DD')
      WHEN trim((${e})::text) ~ '^\\d{4}-\\d{2}-\\d{2}[ T].*$' THEN (trim((${e})::text))::timestamp::date
      WHEN (${e})::text LIKE '%, % de % de %' THEN to_date((${e})::text, 'Day, DD "de" Month "de" YYYY')
      ELSE NULL
    END
  )`;
}
function checkBalancedParens(expr) {
    let depth = 0;
    let inQuote = null;
    for (let i = 0; i < expr.length; i++) {
        const c = expr[i];
        if (inQuote) {
            if (c === inQuote && expr[i - 1] !== "\\")
                inQuote = null;
            continue;
        }
        if (c === "'" || c === '"') {
            inQuote = c;
            continue;
        }
        if (c === "(")
            depth++;
        else if (c === ")") {
            depth--;
            if (depth < 0)
                return "Paréntesis de cierre ) sin apertura.";
        }
    }
    if (depth !== 0)
        return "Faltan paréntesis de cierre.";
    return null;
}
function findTopLevelDivision(expr) {
    let depth = 0;
    let inQuote = null;
    for (let i = 0; i < expr.length; i++) {
        const c = expr[i];
        if (inQuote) {
            if (c === inQuote && expr[i - 1] !== "\\")
                inQuote = null;
            continue;
        }
        if (c === "'" || c === '"') {
            inQuote = c;
            continue;
        }
        if (c === "(")
            depth++;
        else if (c === ")")
            depth--;
        else if (c === "/" && depth === 0)
            return i;
    }
    return -1;
}
function parseRatioExpression(expr) {
    const s = expr.replace(/\s+/g, " ").trim();
    const idx = findTopLevelDivision(s);
    if (idx <= 0 || idx >= s.length - 1)
        return null;
    const numerator = s.slice(0, idx).trim();
    const denominator = s.slice(idx + 1).trim();
    if (!numerator || !denominator)
        return null;
    return { numerator, denominator };
}
function unwrapAggExpression(expr) {
    const s = expr.trim();
    const headMatch = s.match(/^(SUM|AVG|AVERAGE|COUNT|COUNTA|MIN|MAX)\s*\(/i);
    if (!headMatch)
        return null;
    const openParenIndex = headMatch.index + headMatch[0].length - 1;
    const closeParenIndex = (0, coerceNumericSqlExpr_1.findMatchingCloseParen)(s, openParenIndex);
    if (closeParenIndex === -1)
        return null;
    const afterClose = s.slice(closeParenIndex + 1).trim();
    if (afterClose.length > 0)
        return null;
    const inner = s.slice(openParenIndex + 1, closeParenIndex).trim();
    let func = headMatch[1].toUpperCase();
    if (func === "AVERAGE")
        func = "AVG";
    if (func === "COUNTA")
        func = "COUNT";
    return { func, inner };
}
function parseCriterion(crit) {
    const t = crit.trim();
    const match = t.match(/^(\<\>|\>\=|\<\=|\>|\<|\=)?\s*([\s\S]*)$/);
    const op = (match?.[1] ?? "=").replace(/\s/g, "");
    const valueStr = (match?.[2] ?? t).trim();
    return { op: op || "=", valueStr };
}
function buildCountIfSumIfAggregate(expression, derivedLookup) {
    const trimmed = expression.replace(/\s+/g, " ").trim().replace(/;/g, ",");
    const countIfMatch = trimmed.match(/^\s*COUNTIF\s*\(([\s\S]+)\)\s*$/i);
    if (countIfMatch) {
        const args = (0, metricExpressionToSql_1.splitArgs)(countIfMatch[1]);
        if (args.length < 2)
            return null;
        const rangeSql = (0, metricExpressionToSql_1.expressionToSql)(args[0], derivedLookup);
        const crit = parseCriterion(args[1]);
        const valSql = (0, metricExpressionToSql_1.expressionToSql)(args[1], derivedLookup) ?? (0, toSqlLiteral_1.toSqlLiteral)(crit.valueStr.replace(/^['"]|['"]$/g, ""));
        if (!rangeSql)
            return null;
        const whenClause = crit.op === "=" ? `${rangeSql} = ${valSql}` : crit.op === "<>" || crit.op === "!=" ? `${rangeSql} <> ${valSql}` : `${rangeSql} ${crit.op} ${valSql}`;
        return `COUNT(CASE WHEN ${whenClause} THEN 1 END)`;
    }
    const sumIfMatch = trimmed.match(/^\s*SUMIF\s*\(([\s\S]+)\)\s*$/i);
    if (sumIfMatch) {
        const args = (0, metricExpressionToSql_1.splitArgs)(sumIfMatch[1]);
        if (args.length < 2)
            return null;
        const rangeSql = (0, metricExpressionToSql_1.expressionToSql)(args[0], derivedLookup);
        const crit = parseCriterion(args[1]);
        const valSql = (0, metricExpressionToSql_1.expressionToSql)(args[1], derivedLookup) ?? (0, toSqlLiteral_1.toSqlLiteral)(crit.valueStr.replace(/^['"]|['"]$/g, ""));
        const whenClause = crit.op === "=" ? `${rangeSql} = ${valSql}` : crit.op === "<>" || crit.op === "!=" ? `${rangeSql} <> ${valSql}` : `${rangeSql} ${crit.op} ${valSql}`;
        const sumRangeSql = args.length >= 3 ? (0, metricExpressionToSql_1.expressionToSql)(args[2], derivedLookup) : rangeSql;
        if (!rangeSql || !sumRangeSql)
            return null;
        return `SUM(CASE WHEN ${whenClause} THEN ${sumRangeSql} ELSE 0 END)`;
    }
    const countIfsMatch = trimmed.match(/^\s*COUNTIFS\s*\(([\s\S]+)\)\s*$/i);
    if (countIfsMatch) {
        const args = (0, metricExpressionToSql_1.splitArgs)(countIfsMatch[1]);
        if (args.length < 2 || args.length % 2 !== 0)
            return null;
        const conditions = [];
        for (let i = 0; i < args.length; i += 2) {
            const rangeSql = (0, metricExpressionToSql_1.expressionToSql)(args[i], derivedLookup);
            const crit = parseCriterion(args[i + 1]);
            const valSql = (0, metricExpressionToSql_1.expressionToSql)(args[i + 1], derivedLookup) ?? (0, toSqlLiteral_1.toSqlLiteral)(crit.valueStr.replace(/^['"]|['"]$/g, ""));
            if (!rangeSql)
                return null;
            const whenClause = crit.op === "=" ? `${rangeSql} = ${valSql}` : crit.op === "<>" || crit.op === "!=" ? `${rangeSql} <> ${valSql}` : `${rangeSql} ${crit.op} ${valSql}`;
            conditions.push(whenClause);
        }
        return `COUNT(CASE WHEN ${conditions.join(" AND ")} THEN 1 END)`;
    }
    const sumIfsMatch = trimmed.match(/^\s*SUMIFS\s*\(([\s\S]+)\)\s*$/i);
    if (sumIfsMatch) {
        const args = (0, metricExpressionToSql_1.splitArgs)(sumIfsMatch[1]);
        if (args.length < 3 || (args.length - 1) % 2 !== 0)
            return null;
        const sumRangeSql = (0, metricExpressionToSql_1.expressionToSql)(args[0], derivedLookup);
        if (!sumRangeSql)
            return null;
        const conditions = [];
        for (let i = 1; i < args.length; i += 2) {
            const rangeSql = (0, metricExpressionToSql_1.expressionToSql)(args[i], derivedLookup);
            const crit = parseCriterion(args[i + 1]);
            const valSql = (0, metricExpressionToSql_1.expressionToSql)(args[i + 1], derivedLookup) ?? (0, toSqlLiteral_1.toSqlLiteral)(crit.valueStr.replace(/^['"]|['"]$/g, ""));
            if (!rangeSql)
                return null;
            const whenClause = crit.op === "=" ? `${rangeSql} = ${valSql}` : crit.op === "<>" || crit.op === "!=" ? `${rangeSql} <> ${valSql}` : `${rangeSql} ${crit.op} ${valSql}`;
            conditions.push(whenClause);
        }
        return `SUM(CASE WHEN ${conditions.join(" AND ")} THEN ${sumRangeSql} ELSE 0 END)`;
    }
    const averageIfMatch = trimmed.match(/^\s*AVERAGEIF\s*\(([\s\S]+)\)\s*$/i);
    if (averageIfMatch) {
        const args = (0, metricExpressionToSql_1.splitArgs)(averageIfMatch[1]);
        if (args.length < 2)
            return null;
        const rangeSql = (0, metricExpressionToSql_1.expressionToSql)(args[0], derivedLookup);
        const crit = parseCriterion(args[1]);
        const valSql = (0, metricExpressionToSql_1.expressionToSql)(args[1], derivedLookup) ?? (0, toSqlLiteral_1.toSqlLiteral)(crit.valueStr.replace(/^['"]|['"]$/g, ""));
        const whenClause = crit.op === "=" ? `${rangeSql} = ${valSql}` : crit.op === "<>" || crit.op === "!=" ? `${rangeSql} <> ${valSql}` : `${rangeSql} ${crit.op} ${valSql}`;
        const avgRangeSql = args.length >= 3 ? (0, metricExpressionToSql_1.expressionToSql)(args[2], derivedLookup) : rangeSql;
        if (!rangeSql || !avgRangeSql)
            return null;
        return `AVG(CASE WHEN ${whenClause} THEN ${avgRangeSql} END)`;
    }
    return null;
}
async function runAggregateData(body, deps) {
    try {
        if (!body || typeof body !== "object") {
            return jsonResponse({ error: "Cuerpo de la petición inválido" }, { status: 400 });
        }
        const requestedChartType = String(body.chartType ?? "").trim().toLowerCase();
        const dateSlashOrder = body.dateSlashOrder === "MDY" ? "MDY" : "DMY";
        const dateParseOpts = { slashDateOrder: dateSlashOrder };
        if (!Array.isArray(body.metrics) || body.metrics.length === 0) {
            return jsonResponse({ error: "Se requiere al menos una métrica (metrics)" }, { status: 400 });
        }
        const invalidDimensions = [
            ...(Array.isArray(body.dimensions) ? body.dimensions : []),
            body.dimension,
            body.dateDimension,
            body.chartXAxis,
            body.dateGroupBy?.field,
            body.dateRangeFilter?.field,
        ].filter((value) => value !== undefined && isInvalidIdentifier(value));
        if (invalidDimensions.length > 0) {
            return jsonResponse({ error: "Hay dimensiones/campos inválidos en la configuración (valor vacío, undefined o null)." }, { status: 400 });
        }
        for (let i = 0; i < body.metrics.length; i++) {
            const metric = body.metrics[i];
            if (metric.formula)
                continue;
            if (isInvalidIdentifier(metric.field) && !String(metric.expression ?? "").trim()) {
                return jsonResponse({ error: `Métrica en posición ${i + 1}: field inválido (vacío, undefined o null).` }, { status: 400 });
            }
        }
        const allowedAggSet = new Set(ALLOWED_AGG_FUNCTIONS.map((f) => f.toUpperCase()));
        const allowedAggWhenExpression = new Set(["COUNTIF", "SUMIF", "COUNTIFS", "SUMIFS", "AVERAGEIF"]);
        for (let i = 0; i < body.metrics.length; i++) {
            const m = body.metrics[i];
            if (m.formula)
                continue;
            const func = (m.func || "").toString().toUpperCase().trim();
            const expr = m.expression?.trim() ?? "";
            const exprIsCountIfSumIf = /^\s*(COUNTIF|SUMIF|COUNTIFS|SUMIFS|AVERAGEIF)\s*\(/i.test(expr);
            const allowed = allowedAggSet.has(func) ||
                func.startsWith("COUNT(DISTINCT") ||
                func === "COUNTA" ||
                allowedAggWhenExpression.has(func) ||
                exprIsCountIfSumIf;
            if (!allowed) {
                return jsonResponse({ error: `Métrica en posición ${i + 1}: función "${m.func}" no permitida. Use: SUM, AVG, COUNT, COUNTA, MIN, MAX, COUNT(DISTINCT), o expresiones con COUNTIF/SUMIF/COUNTIFS/SUMIFS/AVERAGEIF.` }, { status: 400 });
            }
        }
        if (deps.requireAuth !== false && !deps.userId) {
            return jsonResponse({ error: "No autenticado" }, { status: 401 });
        }
        const allowedPrefixes = ["etl_output.", "public."];
        if (!body.tableName || typeof body.tableName !== "string" || !allowedPrefixes.some((p) => body.tableName.startsWith(p))) {
            return jsonResponse({ error: "Nombre de tabla inválido o no permitido. Use esquema etl_output o public." }, { status: 400 });
        }
        const dotIdx = body.tableName.indexOf(".");
        const schema = body.tableName.substring(0, dotIdx);
        const table = body.tableName.substring(dotIdx + 1);
        if (!table) {
            return jsonResponse({ error: "Formato de tabla inválido (debe ser esquema.nombre_tabla)" }, { status: 400 });
        }
        const tableColumnNames = await fetchTableColumnNames(schema, table, deps.databaseUrl);
        const tableColumnsSet = tableColumnNames ? new Set(tableColumnNames) : null;
        const derivedByName = {};
        const addDerivedFromArray = (arr) => {
            for (const d of arr) {
                const item = d;
                const name = String(item?.name ?? "").trim();
                const expression = String(item?.expression ?? "").trim();
                if (!name || !expression)
                    continue;
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
        if (Array.isArray(body.derivedColumns))
            addDerivedFromArray(body.derivedColumns);
        let etlIdForLookup = body.etlId ?? null;
        if (!etlIdForLookup && table) {
            const tbl = table.toLowerCase();
            const tableWithoutSchema = tbl.includes(".") ? tbl.split(".").slice(-1)[0] ?? tbl : tbl;
            try {
                etlIdForLookup = await deps.findEtlIdByOutputTable(tbl);
            }
            catch { }
            if (!etlIdForLookup) {
                try {
                    etlIdForLookup = await deps.findEtlIdByOutputTable(tableWithoutSchema);
                }
                catch { }
            }
            if (!etlIdForLookup) {
                try {
                    etlIdForLookup = await deps.findEtlIdByRunDestination(tbl);
                }
                catch { }
            }
            if (!etlIdForLookup) {
                try {
                    etlIdForLookup = await deps.findEtlIdByRunDestination(tableWithoutSchema);
                }
                catch { }
            }
        }
        const savedMetricByName = {};
        if (etlIdForLookup) {
            try {
                const layout = await deps.getEtlLayout(etlIdForLookup);
                if (layout) {
                    const cfg = (layout?.dataset_config ?? layout?.datasetConfig);
                    const raw = cfg?.derivedColumns ?? cfg?.derived_columns;
                    if (Array.isArray(raw))
                        addDerivedFromArray(raw);
                    const savedList = Array.isArray(layout?.saved_metrics) ? layout.saved_metrics : [];
                    for (const sm of savedList) {
                        const s = sm;
                        const name = String(s?.name ?? "").trim().toLowerCase();
                        if (!name)
                            continue;
                        const topMetric = s?.metric;
                        const cfgMetrics = s?.aggregationConfig?.metrics;
                        const firstMetric = Array.isArray(cfgMetrics) && cfgMetrics.length > 0 ? cfgMetrics[0] : topMetric;
                        if (!firstMetric)
                            continue;
                        let field = String(firstMetric?.field ?? "").trim();
                        const expression = firstMetric.expression;
                        const alias = String(firstMetric?.alias ?? name);
                        if (field.toLowerCase() === name && !expression) {
                            const byAlias = Array.isArray(cfgMetrics) && cfgMetrics.length > 0
                                ? cfgMetrics.find((mm) => mm?.field && String(mm.field).trim().toLowerCase() !== name)
                                : null;
                            if (byAlias) {
                                field = String(byAlias.field ?? "").trim();
                            }
                            else {
                                field = alias;
                            }
                            if (!field || field.toLowerCase() === name) {
                                const agg = s?.aggregationConfig;
                                const dim = (agg?.dimension && String(agg.dimension).trim()) || (agg?.dimension2 && String(agg.dimension2).trim()) || (Array.isArray(agg?.dimensions) && agg.dimensions[0] && String(agg.dimensions[0]).trim()) || "";
                                if (dim && dim.toLowerCase() !== name)
                                    field = dim;
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
            }
            catch { }
        }
        if (Array.isArray(body.savedMetrics) && body.savedMetrics.length > 0) {
            for (const sm of body.savedMetrics) {
                const name = typeof sm?.name === "string" ? String(sm.name).trim() : "";
                if (!name)
                    continue;
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
        console.log("[aggregate-data] derivedByName keys:", Object.keys(derivedByName), "etlIdForLookup:", etlIdForLookup);
        const getDerived = (field) => {
            if (!field || !String(field).trim())
                return undefined;
            return derivedByName[String(field).trim().toLowerCase()];
        };
        const filterWarnings = [];
        const validFilters = [];
        if (body.filters && body.filters.length > 0) {
            for (const f of body.filters) {
                const fieldNorm = (f.field || "").replace(/"/g, "").trim().toLowerCase();
                const isDerivedField = !!fieldNorm && !!derivedByName[fieldNorm];
                if (tableColumnsSet && fieldNorm && !tableColumnsSet.has(fieldNorm) && !isDerivedField) {
                    filterWarnings.push({
                        filterId: f.id,
                        field: f.field,
                        reason: "column_not_in_table",
                    });
                }
                else {
                    validFilters.push(f);
                }
            }
        }
        else {
            validFilters.push(...(body.filters || []));
        }
        const compareSpecForQuery = (0, compareSpec_1.normalizeAggregationCompare)({
            compare: body.compare,
            comparePeriod: body.comparePeriod,
            compareFixedValue: body.compareFixedValue,
            transformCompare: body.transformCompare,
            transformCompareFixedValue: body.transformCompareFixedValue,
            dateGroupBy: body.dateGroupBy,
            dateDimension: body.dateDimension,
        });
        let filtersForQuery = [...validFilters];
        const compareFieldForQuery = body.dateGroupBy?.field?.trim() ||
            (compareSpecForQuery.kind === "temporal" || compareSpecForQuery.kind === "cumulative"
                ? compareSpecForQuery.timeColumn?.trim()
                : "") ||
            String(body.dateDimension ?? "").trim();
        if ((0, compareDisplayKeys_1.compareNeedsTimeGroupedRows)(compareSpecForQuery) && compareFieldForQuery) {
            const relatedDateFields = [
                body.dateDimension,
                compareSpecForQuery.kind === "temporal" || compareSpecForQuery.kind === "cumulative"
                    ? compareSpecForQuery.timeColumn
                    : undefined,
            ].filter((x) => !!String(x ?? "").trim());
            filtersForQuery = (0, expandAggregationFiltersForCompare_1.expandAggregationFiltersForTemporalCompare)(filtersForQuery, {
                compareField: compareFieldForQuery,
                compareSpec: compareSpecForQuery,
                aggComparePeriodSource: body.comparePeriodSource,
                relatedDateFields,
            });
        }
        const buildWhenClause = (cond) => {
            const op = (cond.operator || "=").toUpperCase().trim();
            const f = (0, metricExpressionToSql_1.quotedColumn)(cond.field);
            if (op === "IN") {
                const list = (Array.isArray(cond.value) ? cond.value : [cond.value])
                    .map((x) => (0, toSqlLiteral_1.toSqlLiteral)(x))
                    .join(", ");
                if (!list.trim())
                    return "TRUE";
                return `${f} IN (${list})`;
            }
            if ((op === "IS" || op === "IS NOT") && cond.value == null)
                return `${f} ${op} NULL`;
            return `${f} ${op} ${(0, toSqlLiteral_1.toSqlLiteral)(cond.value)}`;
        };
        const buildConditionExpr = (cond, thenExpr) => `CASE WHEN ${buildWhenClause(cond)} THEN ${thenExpr} END`;
        const metricsBase = body.metrics.filter((m) => !m.formula);
        const metricsFormula = body.metrics.filter((m) => m.formula);
        for (let i = 0; i < metricsBase.length; i++) {
            const m = metricsBase[i];
            const derived = getDerived(m.field);
            const metricExpr = m.expression;
            let expr = (metricExpr && metricExpr.trim()) ? metricExpr.trim() : (derived?.expression ?? null);
            if (expr) {
                const uw = unwrapAggExpression(expr);
                if (uw)
                    expr = uw.inner;
            }
            if (expr != null && String(expr).trim() !== "") {
                const exprStr = String(expr).trim();
                const parenError = checkBalancedParens(exprStr);
                if (parenError) {
                    return jsonResponse({ error: `Métrica en posición ${i + 1}: ${parenError}` }, { status: 400 });
                }
                if (!(0, metricExpressionToSql_1.expressionToSql)(exprStr, derivedByName)) {
                    return jsonResponse({ error: `Métrica en posición ${i + 1}: la expresión no es válida. Revisá que solo uses columnas del dataset, números, operadores ( * - + / ^ ), comillas para texto, y funciones soportadas (IF, SUM, AVG, ROUND, UPPER, etc.).` }, { status: 400 });
                }
            }
            else if (!m.field || !String(m.field).trim()) {
                return jsonResponse({ error: `Métrica en posición ${i + 1}: indicá una expresión (ej. CANTIDAD * PRECIO_UNITARIO) o un campo.` }, { status: 400 });
            }
            else if (!derived) {
            }
        }
        const metricClauses = metricsBase
            .map((m) => {
            const i = body.metrics.indexOf(m);
            const derived = getDerived(m.field);
            const savedMetric = m.field && !derived ? savedMetricByName[String(m.field).trim().toLowerCase()] : undefined;
            let resolvedExpr = "";
            if (derived) {
                resolvedExpr = derived.expression;
            }
            const metricExpr = m.expression;
            if (metricExpr && metricExpr.trim()) {
                resolvedExpr = metricExpr.trim();
            }
            if (!resolvedExpr && savedMetric?.expression) {
                resolvedExpr = savedMetric.expression;
            }
            let func = (m.func || derived?.defaultAggregation || savedMetric?.func || "SUM").toString().toUpperCase();
            let isCompoundAggregate = false;
            if (resolvedExpr) {
                const unwrapped = unwrapAggExpression(resolvedExpr);
                isCompoundAggregate = !unwrapped && /\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/i.test(resolvedExpr);
                if (unwrapped) {
                    resolvedExpr = unwrapped.inner;
                    if (!m.func || m.func === "SUM")
                        func = unwrapped.func;
                }
            }
            const effectiveField = (!resolvedExpr && savedMetric?.field) ? savedMetric.field : m.field;
            const derivedForField = getDerived(effectiveField);
            if (!resolvedExpr && derivedForField?.expression) {
                resolvedExpr = derivedForField.expression;
                if (!func || func === "SUM")
                    func = (derivedForField.defaultAggregation || "SUM").toUpperCase();
                const unwrapped = unwrapAggExpression(resolvedExpr);
                isCompoundAggregate = !unwrapped && /\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/i.test(resolvedExpr);
                if (unwrapped) {
                    resolvedExpr = unwrapped.inner;
                    func = unwrapped.func;
                }
            }
            m._compoundAggregate = isCompoundAggregate;
            func = (0, metricExpressionToSql_1.coerceAggFuncForTextOnlyIFS)(func, resolvedExpr);
            const fieldExpr = (() => {
                if (resolvedExpr) {
                    const countIfSumIfAgg = buildCountIfSumIfAggregate(resolvedExpr, derivedByName);
                    if (countIfSumIfAgg) {
                        m._forceAggregate = countIfSumIfAgg;
                        return "1";
                    }
                    const ratioParsed = parseRatioExpression(resolvedExpr);
                    if (ratioParsed) {
                        const numHasAgg = /\b(SUM|AVG|COUNT|MIN|MAX|COUNTA)\s*\(/i.test(ratioParsed.numerator);
                        const denHasAgg = /\b(SUM|AVG|COUNT|MIN|MAX|COUNTA)\s*\(/i.test(ratioParsed.denominator);
                        if (numHasAgg || denHasAgg) {
                            m._ratioAggregateError = true;
                            return "1";
                        }
                        const numSql = (0, metricExpressionToSql_1.expressionToSql)(ratioParsed.numerator, derivedByName);
                        const denSql = (0, metricExpressionToSql_1.expressionToSql)(ratioParsed.denominator, derivedByName);
                        if (numSql && denSql) {
                            m._ratioAggregate = {
                                numSql: (0, coerceNumericSqlExpr_1.coerceArithmeticOperandsToNumeric)(numSql),
                                denSql: (0, coerceNumericSqlExpr_1.coerceArithmeticOperandsToNumeric)(denSql),
                            };
                            return "1";
                        }
                    }
                    const uniqueMatch = resolvedExpr.trim().match(/^\s*UNIQUE\s*\(([\s\S]+)\)\s*$/i);
                    if (uniqueMatch) {
                        const inner = uniqueMatch[1].trim();
                        const innerSql = (0, metricExpressionToSql_1.expressionToSql)(inner, derivedByName);
                        if (innerSql) {
                            const countDistinctExpr = `COUNT(DISTINCT (${innerSql}))`;
                            m._forceCountDistinct = countDistinctExpr;
                            return innerSql;
                        }
                    }
                    const sqlExpr = (0, metricExpressionToSql_1.expressionToSql)(resolvedExpr, derivedByName);
                    if (sqlExpr)
                        return (0, coerceNumericSqlExpr_1.coerceArithmeticOperandsToNumeric)(sqlExpr);
                    console.warn("[aggregate-data] expressionToSql returned null for:", resolvedExpr);
                }
                if (derived) {
                    console.warn("[aggregate-data] FALLTHROUGH: derived col", m.field, "expr:", derived.expression, "resolvedExpr:", resolvedExpr);
                }
                const isSavedNameAsColumn = savedMetric && String(effectiveField || "").trim().toLowerCase() === String(m.field || "").trim().toLowerCase();
                if (isSavedNameAsColumn && (func === "COUNT" || func.startsWith("COUNT(DISTINCT"))) {
                    return "1";
                }
                if (isSavedNameAsColumn) {
                    return "0";
                }
                const col = (0, metricExpressionToSql_1.quotedColumn)(effectiveField);
                if (m.cast === "sanitize")
                    return (0, coerceNumericSqlExpr_1.safeNumericCast)(`regexp_replace(${col}::text, '[^0-9\\.-]', '', 'g')`);
                if (m.cast === "numeric")
                    return (0, coerceNumericSqlExpr_1.safeNumericCast)(col);
                return col;
            })();
            const internalAlias = `metric_${i}`;
            m.internalAlias = internalAlias;
            let aggExpr;
            const forceAggregate = m._forceAggregate;
            const forceCountDistinct = m._forceCountDistinct;
            const compoundAggregate = m._compoundAggregate;
            const ratioAggregate = m._ratioAggregate;
            if (ratioAggregate) {
                aggExpr = `SUM(${ratioAggregate.numSql}) / NULLIF(SUM(${ratioAggregate.denSql}), 0)`;
            }
            else if (forceAggregate) {
                aggExpr = forceAggregate;
            }
            else if (forceCountDistinct) {
                aggExpr = forceCountDistinct;
            }
            else if (compoundAggregate) {
                aggExpr = fieldExpr;
            }
            else if (m.condition) {
                const whenClause = buildWhenClause(m.condition);
                if (func === "COUNT" || func.startsWith("COUNT(DISTINCT"))
                    aggExpr = `COUNT(CASE WHEN ${whenClause} THEN 1 END)`;
                else
                    aggExpr = `${func}(${buildConditionExpr(m.condition, fieldExpr)})`;
            }
            else {
                if (func === "COUNTA") {
                    aggExpr = `COUNT(${fieldExpr})`;
                }
                else if (func.startsWith("COUNT(DISTINCT"))
                    aggExpr = `COUNT(DISTINCT ${fieldExpr})`;
                else
                    aggExpr = `${func}(${fieldExpr})`;
            }
            return `${aggExpr} AS "${internalAlias}"`;
        })
            .join(", ");
        if (metricsBase.some((m) => m._ratioAggregateError)) {
            return jsonResponse({ error: "No se puede usar una expresión que sea «agregado / agregado» (ej. sum(...)/count(...)) como una sola métrica. Creá dos métricas (numerador y denominador), guardalas, y luego en Cálculo usá «Reutilizar métricas existentes» con fórmula metric_0 / NULLIF(metric_1, 0)." }, { status: 400 });
        }
        const dimList = (body.dimensions && body.dimensions.length > 0)
            ? body.dimensions.filter((d) => !isInvalidIdentifier(d))
            : body.dimension && !isInvalidIdentifier(body.dimension)
                ? [body.dimension]
                : [];
        for (const d of dimList) {
            const derived = getDerived(d);
            if (!derived)
                continue;
            const exprStr = derived.expression.trim();
            const parenError = checkBalancedParens(exprStr);
            if (parenError) {
                return jsonResponse({ error: `Dimensión «${d}»: ${parenError}` }, { status: 400 });
            }
            if (!(0, metricExpressionToSql_1.expressionToSql)(exprStr, derivedByName)) {
                return jsonResponse({
                    error: `Dimensión «${d}»: la expresión de la columna calculada no es válida. Revisá que solo uses columnas del dataset, números, operadores ( * - + / ^ ), comillas para texto, y funciones soportadas (IF, IFS, SUM, AVG, ROUND, UPPER, etc.).`,
                }, { status: 400 });
            }
        }
        const resolveDimensionCoalesce = (dim) => {
            const sql = (0, metricExpressionToSql_1.resolveFieldToSql)(dim, derivedByName);
            if (!sql) {
                return `COALESCE(${(0, metricExpressionToSql_1.quotedColumn)(dim)}::text, 'Sin Categoría')`;
            }
            return `COALESCE((${sql})::text, 'Sin Categoría')`;
        };
        let dimensionSelectClause = "";
        let dimensionGroupByClause = "";
        let dateGroupByExpr = "";
        let dateGroupByDisplayExpr = "";
        if (body.dateGroupBy?.field && body.dateGroupBy?.granularity) {
            const dgCol = (0, metricExpressionToSql_1.quotedColumn)(body.dateGroupBy.field);
            const dgDateExpr = safeDateCast(dgCol, dateSlashOrder);
            const gran = body.dateGroupBy.granularity.toLowerCase().replace(/[^a-z]/g, "");
            const validGranList = ["day", "week", "month", "quarter", "semester", "year"];
            const validGran = validGranList.includes(gran) ? gran : "month";
            if (validGran === "semester") {
                dateGroupByExpr = `(EXTRACT(YEAR FROM ${dgDateExpr}::timestamp)::text || '-S' || CASE WHEN EXTRACT(MONTH FROM ${dgDateExpr}::timestamp) <= 6 THEN '1' ELSE '2' END)`;
                dateGroupByDisplayExpr = `(CASE WHEN EXTRACT(MONTH FROM ${dgDateExpr}::timestamp) <= 6 THEN 'S1/' ELSE 'S2/' END || EXTRACT(YEAR FROM ${dgDateExpr}::timestamp)::text)`;
            }
            else {
                dateGroupByExpr = `DATE_TRUNC('${validGran}', ${dgDateExpr}::timestamp)`;
                if (validGran === "year") {
                    dateGroupByDisplayExpr = `TO_CHAR(${dateGroupByExpr}, 'YYYY')`;
                }
                else if (validGran === "month") {
                    dateGroupByDisplayExpr = `TO_CHAR(${dateGroupByExpr}, 'YYYY-MM')`;
                }
                else if (validGran === "quarter") {
                    dateGroupByDisplayExpr = `('T' || EXTRACT(QUARTER FROM ${dateGroupByExpr})::text || '/' || EXTRACT(YEAR FROM ${dateGroupByExpr})::text)`;
                }
                else {
                    dateGroupByDisplayExpr = `TO_CHAR(${dateGroupByExpr}, 'DD/MM/YYYY')`;
                }
            }
            const timeField = (body.dateGroupBy.field || "").trim().replace(/"/g, '""');
            const dateParts = dimList.length > 0
                ? dimList.map((d) => {
                    const alias = (d || "").trim().replace(/"/g, '""');
                    if (alias === body.dateGroupBy.field?.trim() || normalizeStr(alias) === normalizeStr(body.dateGroupBy.field || "")) {
                        return `${dateGroupByDisplayExpr} AS "${alias}"`;
                    }
                    return `${resolveDimensionCoalesce(d)} AS "${alias}"`;
                })
                : [`${dateGroupByDisplayExpr} AS "${timeField}"`];
            dimensionSelectClause = dateParts.join(", ");
            const groupParts = [dateGroupByExpr];
            if (dimList.length > 0) {
                groupParts.push(...dimList
                    .filter((d) => (d || "").trim() !== (body.dateGroupBy.field || "").trim() && normalizeStr((d || "").trim()) !== normalizeStr(body.dateGroupBy.field || ""))
                    .map((d) => resolveDimensionCoalesce(d)));
            }
            dimensionGroupByClause = groupParts.join(", ");
        }
        else if (dimList.length > 0) {
            const parts = dimList.map((d) => {
                const alias = (d || "").trim().replace(/"/g, '""');
                return `${resolveDimensionCoalesce(d)} AS "${alias}"`;
            });
            dimensionSelectClause = parts.join(", ");
            dimensionGroupByClause = dimList.map((d) => resolveDimensionCoalesce(d)).join(", ");
        }
        const selectClause = [dimensionSelectClause, metricClauses]
            .filter(Boolean)
            .join(", ");
        if (!selectClause.trim()) {
            return jsonResponse({ error: "La consulta debe incluir al menos una dimensión o una métrica base (no solo fórmulas)." }, { status: 400 });
        }
        let query = `SELECT ${selectClause} FROM "${schema}"."${table}"`;
        let whereClausesStr = "";
        const dateRangeClause = (() => {
            const dr = body.dateRangeFilter;
            if (!dr?.field)
                return "";
            const drCol = (0, metricExpressionToSql_1.quotedColumn)(dr.field);
            const drDateExpr = safeDateCast(drCol, dateSlashOrder);
            if (dr.from != null && dr.to != null) {
                const from = String(dr.from).trim().replace(/'/g, "''");
                const to = String(dr.to).trim().replace(/'/g, "''");
                if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
                    return `${drDateExpr} BETWEEN '${from}' AND '${to}'`;
                }
            }
            if (dr.last == null || Number(dr.last) <= 0)
                return "";
            const n = Math.max(1, Math.min(9999, Math.round(Number(dr.last))));
            const unit = dr.unit === "days" ? "days" : "months";
            const maxDateSubquery = `(SELECT MAX(${drDateExpr}) FROM "${schema}"."${table}")`;
            return `${drDateExpr} >= (${maxDateSubquery} - INTERVAL '${n} ${unit}')`;
        })();
        if (filtersForQuery.length > 0) {
            const whereClauses = filtersForQuery
                .map((f) => {
                const resolvedFieldSql = (0, metricExpressionToSql_1.resolveFieldToSql)(f.field, derivedByName);
                const col = resolvedFieldSql ?? (0, metricExpressionToSql_1.quotedColumn)(f.field);
                const op = (f.operator || "=").toUpperCase().trim();
                const useDateExprForYearLike = (op === "=" && isYearLike(f.value)) ||
                    (op === "IN" && Array.isArray(f.value) && f.value.length > 0 && isYearLike(f.value));
                let fieldExpression;
                if (op === "MONTH" ||
                    op === "DAY" ||
                    op === "YEAR" ||
                    op === "QUARTER" ||
                    op === "SEMESTER" ||
                    op === "YEAR_MONTH" ||
                    useDateExprForYearLike) {
                    fieldExpression = safeDateCast(col, dateSlashOrder);
                }
                else {
                    fieldExpression =
                        f.cast === "numeric"
                            ? (0, coerceNumericSqlExpr_1.safeNumericCast)(col)
                            : col;
                }
                if (op === "MONTH") {
                    const monthVal = (0, expandMonthFilterWithYear_1.expandMonthValueWithYearFromFilters)(f.field, f.value, validFilters);
                    return (0, monthFilterSql_1.buildMonthFilterSqlClause)(fieldExpression, monthVal);
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
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStr))
                        return "TRUE";
                    return `${fieldExpression} = DATE '${dayStr}'`;
                }
                if (op === "QUARTER") {
                    if (Array.isArray(f.value)) {
                        const list = f.value
                            .map((v) => Number(v))
                            .filter((n) => !isNaN(n) && n >= 1 && n <= 4)
                            .join(", ");
                        if (!list)
                            return "TRUE";
                        return `EXTRACT(QUARTER FROM ${fieldExpression}) IN (${list})`;
                    }
                    const q = Number(f.value);
                    if (isNaN(q) || q < 1 || q > 4)
                        return "TRUE";
                    return `EXTRACT(QUARTER FROM ${fieldExpression}) = ${q}`;
                }
                if (op === "SEMESTER") {
                    const semExpr = `(CASE WHEN EXTRACT(MONTH FROM ${fieldExpression}) <= 6 THEN 1 ELSE 2 END)`;
                    if (Array.isArray(f.value)) {
                        const list = f.value
                            .map((v) => Number(v))
                            .filter((n) => !isNaN(n) && (n === 1 || n === 2))
                            .join(", ");
                        if (!list)
                            return "TRUE";
                        return `${semExpr} IN (${list})`;
                    }
                    const s = Number(f.value);
                    if (isNaN(s) || (s !== 1 && s !== 2))
                        return "TRUE";
                    return `${semExpr} = ${s}`;
                }
                if (op === "YEAR_MONTH") {
                    return (0, monthFilterSql_1.buildMonthFilterSqlClause)(fieldExpression, f.value);
                }
                if (op === "=" && isYearLike(f.value)) {
                    return `EXTRACT(YEAR FROM ${fieldExpression}) = ${Number(f.value)}`;
                }
                if (op === "IN" && Array.isArray(f.value) && f.value.length > 0 && isYearLike(f.value)) {
                    const yearList = f.value
                        .map((v) => Number(v))
                        .filter((n) => !isNaN(n) && n >= 1900 && n <= 2100)
                        .join(", ");
                    if (yearList)
                        return `EXTRACT(YEAR FROM ${fieldExpression}) IN (${yearList})`;
                }
                if (op === "IN") {
                    const list = (Array.isArray(f.value) ? f.value : [])
                        .map((x) => (0, toSqlLiteral_1.toSqlLiteral)(x))
                        .join(", ");
                    if (!list)
                        return "TRUE";
                    return `${fieldExpression} IN (${list})`;
                }
                if (op === "BETWEEN") {
                    let from, to;
                    if (Array.isArray(f.value))
                        [from, to] = f.value;
                    else if (f.value && typeof f.value === "object") {
                        from = f.value.from;
                        to = f.value.to;
                    }
                    return `${fieldExpression} BETWEEN ${(0, toSqlLiteral_1.toSqlLiteral)(from)} AND ${(0, toSqlLiteral_1.toSqlLiteral)(to)}`;
                }
                if ((op === "IS" || op === "IS NOT") && f.value === null)
                    return `${fieldExpression} ${op} NULL`;
                if (op === "EXACT")
                    return `${fieldExpression} = ${(0, toSqlLiteral_1.toSqlLiteral)(f.value)}`;
                if (op === "CONTAINS")
                    return `${fieldExpression}::text ILIKE '%' || ${(0, toSqlLiteral_1.toSqlLiteral)(String(f.value ?? ""))} || '%'`;
                if (op === "STARTS_WITH")
                    return `${fieldExpression}::text ILIKE ${(0, toSqlLiteral_1.toSqlLiteral)(String(f.value ?? ""))} || '%'`;
                if (op === "ENDS_WITH")
                    return `${fieldExpression}::text ILIKE '%' || ${(0, toSqlLiteral_1.toSqlLiteral)(String(f.value ?? ""))}`;
                return `${fieldExpression} ${op} ${(0, toSqlLiteral_1.toSqlLiteral)(f.value)}`;
            })
                .join(" AND ");
            whereClausesStr = whereClauses || "";
        }
        const allWhere = [dateRangeClause, whereClausesStr].filter(Boolean).join(" AND ");
        if (allWhere)
            query += ` WHERE ${allWhere}`;
        if (dimensionGroupByClause) {
            query += ` GROUP BY ${dimensionGroupByClause}`;
        }
        if (body.orderBy?.field) {
            const dir = (body.orderBy.direction || "DESC").toString().toUpperCase();
            const safeDir = dir === "ASC" ? "ASC" : "DESC";
            let orderByField = `"${body.orderBy.field.replace(/"/g, '""')}"`;
            const requestedSortNormalized = normalizeStr(body.orderBy.field);
            const dateFieldNormalized = normalizeStr(body.dateGroupBy?.field || "");
            const temporalSortRequested = !!dateGroupByExpr &&
                !!dateFieldNormalized &&
                (requestedSortNormalized === dateFieldNormalized ||
                    requestedSortNormalized.includes(dateFieldNormalized) ||
                    dateFieldNormalized.includes(requestedSortNormalized));
            if (temporalSortRequested) {
                orderByField = dateGroupByExpr;
            }
            const dimMatch = dimList.find((d) => normalizeStr(d) === requestedSortNormalized);
            if (!temporalSortRequested && dimMatch) {
                orderByField = `"${dimMatch.replace(/"/g, '""')}"`;
            }
            else if (!temporalSortRequested) {
                const metricIdxMatch = /^metric_(\d+)$/i.exec(String(body.orderBy.field || "").trim());
                let orderByInternal;
                if (metricIdxMatch) {
                    const idx = parseInt(metricIdxMatch[1], 10);
                    if (Number.isFinite(idx) && idx >= 0 && idx < body.metrics.length) {
                        const ia = body.metrics[idx].internalAlias;
                        if (typeof ia === "string" && ia.trim() !== "")
                            orderByInternal = ia;
                    }
                }
                if (orderByInternal) {
                    orderByField = `"${orderByInternal.replace(/"/g, '""')}"`;
                }
                else {
                    const matchedMetric = body.metrics.find((m) => {
                        const sig = `${m.func}(${m.field})`;
                        return (requestedSortNormalized === normalizeStr(m.alias || "") ||
                            requestedSortNormalized === normalizeStr(sig));
                    });
                    if (matchedMetric)
                        orderByField = `"${matchedMetric.internalAlias}"`;
                }
            }
            query += ` ORDER BY ${orderByField} ${safeDir}`;
        }
        else if (dateGroupByExpr) {
            query += ` ORDER BY ${dateGroupByExpr} ASC`;
        }
        const SAFETY_MAX_ROWS = 500_000;
        if (body.unlimited === true) {
            query += ` LIMIT ${SAFETY_MAX_ROWS}`;
        }
        else if (body.limit != null && body.limit > 0) {
            const lim = Math.max(1, Math.min(SAFETY_MAX_ROWS, parseInt(String(body.limit), 10) || 5000));
            query += ` LIMIT ${lim}`;
        }
        const aliasToMetricRef = body.metrics
            .map((m, idx) => ({ alias: (m.alias || "").trim(), ref: `metric_${idx}` }))
            .filter((x) => x.alias.length > 0)
            .sort((a, b) => b.alias.length - a.alias.length);
        const resolveAliasesInFormula = (formula) => {
            let s = formula.replace(/\s+/g, " ").trim();
            for (const { alias, ref } of aliasToMetricRef) {
                if (alias && s.includes(alias))
                    s = s.split(alias).join(ref);
            }
            return s;
        };
        const safeFormula = (expr) => {
            if (!expr || typeof expr !== "string")
                return null;
            const withAliases = resolveAliasesInFormula(expr);
            const s = withAliases.replace(/\s+/g, " ").trim();
            if (!/^[metric_0-9\s\-+*/().,NULLIFROUNDCOALESCE]+$/i.test(s))
                return null;
            return s;
        };
        const findMetricRefsInFormula = (expr) => {
            const refs = [];
            const re = /metric_(\d+)\b/gi;
            let match;
            while ((match = re.exec(expr)) != null) {
                const idx = Number.parseInt(match[1] ?? "", 10);
                if (Number.isFinite(idx))
                    refs.push(idx);
            }
            return refs;
        };
        if (metricsFormula.length > 0) {
            const maxMetricIndex = body.metrics.length - 1;
            for (const m of metricsFormula) {
                const expr = safeFormula(m.formula);
                if (!expr) {
                    return jsonResponse({ error: `Fórmula inválida en la métrica «${m.alias || "sin nombre"}». Revisá la sintaxis.` }, { status: 400 });
                }
                const outOfRangeRef = findMetricRefsInFormula(expr).find((idx) => idx < 0 || idx > maxMetricIndex);
                if (outOfRangeRef != null) {
                    return jsonResponse({ error: `La fórmula de «${m.alias || "sin nombre"}» referencia metric_${outOfRangeRef}, pero solo existen métricas hasta metric_${maxMetricIndex}.` }, { status: 400 });
                }
            }
            const formulaSelects = metricsFormula
                .map((m) => {
                const i = body.metrics.indexOf(m);
                const expr = safeFormula(m.formula);
                if (!expr)
                    return null;
                return `(${expr}) AS "metric_${i}"`;
            })
                .filter(Boolean);
            if (formulaSelects.length > 0)
                query = `SELECT _sub.*, ${formulaSelects.join(", ")} FROM (${query}) AS _sub`;
        }
        const cumulative = body.cumulative && body.cumulative !== "none" && dimList.length > 0;
        if (cumulative) {
            const orderDim = dimList[0].replace(/"/g, '""');
            const partition = body.cumulative === "ytd" && body.dateDimension
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
        console.log("[aggregate-data] query:", query.slice(0, 300), "| derivedKeys:", Object.keys(derivedByName));
        const { data, error } = await deps.executeSql(query);
        if (error) {
            const msg = error.message || String(error);
            console.error("[aggregate-data] execute_sql error:", msg, "Query:", query.slice(0, 500), "derivedByName:", JSON.stringify(derivedByName));
            let userMsg = "Error al ejecutar la agregación: " + msg;
            if (/function\s+(sum|avg)\s*\(\s*text\s*\)\s+does\s+not\s+exist/i.test(msg)) {
                userMsg +=
                    " Si la métrica usa IFS con comillas (etiquetas de texto), el agregado SUM/AVG se reemplaza por MAX automáticamente; si ves este error, probá elegir MAX o MIN en la métrica, o definí la categoría como columna calculada.";
            }
            if (/column\s+["']?(\w+)["']?\s+does not exist/i.test(msg)) {
                const colMatch = msg.match(/column\s+["']?(\w+)["']?\s+does not exist/i);
                const colName = colMatch ? colMatch[1] : "";
                const isDerived = derivedByName[colName.toLowerCase()];
                if (isDerived) {
                    userMsg = `Error interno: la columna «${colName}» fue encontrada como derivada (expr: ${isDerived.expression}) pero el SQL generado no la expandió. Contactá soporte.`;
                }
                else {
                    const availableDerived = Object.keys(derivedByName).join(", ") || "(ninguna)";
                    const savedNames = Object.keys(savedMetricByName).length ? ` Métricas guardadas del ETL: ${Object.keys(savedMetricByName).join(", ")}.` : "";
                    userMsg = `La columna «${colName}» no existe en la tabla ni como columna calculada. Columnas calculadas disponibles: ${availableDerived}. Creala en Métricas → Fórmula → Crear columna. Si «${colName}» es una métrica guardada, asegurate de que el widget use la fuente de datos del ETL donde está definida (mismo ETL) o enviá en el body del request el array «savedMetrics» con la definición de esa métrica (name, field, expression, etc.).${savedNames}`;
                }
            }
            return jsonResponse({ error: userMsg }, { status: 500 });
        }
        let results = data || [];
        const mappedResults = results.map((row) => {
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
            if (body.dateGroupBy?.field && body.dateGroupBy?.granularity) {
                const key = Object.keys(newRow).find((k) => normalizeStr(k) === normalizeStr(body.dateGroupBy?.field ?? "")) ??
                    body.dateGroupBy.field;
                const current = newRow[key];
                if (typeof current === "string" && current.trim() !== "") {
                    const normalized = (0, dateFormatting_1.formatDateByGranularity)(current, body.dateGroupBy.granularity, current, dateParseOpts);
                    if (normalized != null)
                        newRow[key] = normalized;
                }
            }
            return newRow;
        });
        const compareSpec = (0, compareSpec_1.normalizeAggregationCompare)({
            compare: body.compare,
            comparePeriod: body.comparePeriod,
            compareFixedValue: body.compareFixedValue,
            transformCompare: body.transformCompare,
            transformCompareFixedValue: body.transformCompareFixedValue,
            dateGroupBy: body.dateGroupBy,
            dateDimension: body.dateDimension,
        });
        const metricExternalKeys = body.metrics.map((m, i) => {
            const key = (m.alias && String(m.alias).trim()) || `${m.func}(${m.field})`;
            return key || `metric_${i}`;
        });
        const dimensionColumnsOrdered = [];
        const dgf = body.dateGroupBy?.field?.trim();
        if (dgf)
            dimensionColumnsOrdered.push(dgf);
        for (const d of dimList) {
            const t = (d || "").trim();
            if (!t)
                continue;
            if (!dimensionColumnsOrdered.some((x) => normalizeStr(x) === normalizeStr(t))) {
                dimensionColumnsOrdered.push(t);
            }
        }
        const comparedResults = compareSpec.kind === "none"
            ? mappedResults
            : (0, compareMetricRows_1.applyCompareSpecToRows)(mappedResults, metricExternalKeys, compareSpec, {
                parseDateOpts: body.dateSlashOrder === "MDY" ? { slashDateOrder: "MDY" } : { slashDateOrder: "DMY" },
                dimensionColumns: dimensionColumnsOrdered,
            });
        const requestedSortNormalized = normalizeStr(body.orderBy?.field || "");
        const dateFieldNormalized = normalizeStr(body.dateGroupBy?.field || "");
        const temporalKey = body.dateGroupBy?.field
            ? (mappedResults[0]
                ? Object.keys(mappedResults[0]).find((k) => normalizeStr(k) === normalizeStr(body.dateGroupBy?.field || ""))
                : undefined) ?? body.dateGroupBy.field
            : undefined;
        const requestedTemporalSort = !!body.dateGroupBy?.field &&
            (requestedSortNormalized === "" ||
                requestedSortNormalized === dateFieldNormalized ||
                requestedSortNormalized === normalizeStr(temporalKey || "") ||
                requestedSortNormalized.includes(dateFieldNormalized) ||
                requestedSortNormalized.includes(normalizeStr(temporalKey || "")) ||
                dateFieldNormalized.includes(requestedSortNormalized));
        const directionMultiplier = (body.orderBy?.direction || "ASC").toString().toUpperCase() === "DESC" ? -1 : 1;
        const sortedResults = body.dateGroupBy?.field && requestedTemporalSort && temporalKey
            ? [...comparedResults].sort((a, b) => {
                const va = a[temporalKey];
                const vb = b[temporalKey];
                const ta = (0, dateFormatting_1.parseDateLike)(va, dateParseOpts)?.getTime() ?? NaN;
                const tb = (0, dateFormatting_1.parseDateLike)(vb, dateParseOpts)?.getTime() ?? NaN;
                if (!Number.isNaN(ta) && !Number.isNaN(tb))
                    return (ta - tb) * directionMultiplier;
                return String(va ?? "").localeCompare(String(vb ?? ""), undefined, { numeric: true }) * directionMultiplier;
            })
            : comparedResults;
        const shouldEnrichGeo = requestedChartType === "map" ||
            /\b(lat|lon|lng|geo|country|pais|ciudad|city|localidad|provincia|estado)\b/i.test(dimList.join(" "));
        const cacheClient = deps.geoCacheClient ?? null;
        const geoReadyRows = shouldEnrichGeo
            ? await (0, geo_enrichment_1.enrichRowsWithGeo)({
                rows: sortedResults,
                dimList,
                chartXAxis: body.chartXAxis ?? body.dimension ?? body.dimensions?.[0],
                geoHints: body.geoHints,
                mapDefaultCountry: typeof body.mapDefaultCountry === "string" ? body.mapDefaultCountry : undefined,
                geoComponentOverrides: (0, geo_enrichment_1.coerceGeoComponentOverrides)(body.geoComponentOverrides),
                geoOverridesByXLabel: (0, geo_enrichment_1.coerceGeoOverridesByXLabel)(body.geoOverridesByXLabel),
                cacheClient,
            })
            : sortedResults;
        if (filterWarnings.length > 0) {
            return jsonResponse({ rows: geoReadyRows, filterWarnings });
        }
        return jsonResponse(geoReadyRows);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[aggregate-data] Error:", message, err);
        return jsonResponse({ error: "Error en agregación: " + message }, { status: 500 });
    }
}
//# sourceMappingURL=aggregateDataHandler.js.map