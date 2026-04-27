import {
  buildCountIfSumIfAggregate,
  parseRatioExpression,
  quotedColumn,
  unwrapAggExpression,
} from "@/lib/formula-engine";
import type { DerivedColumnRef } from "@/lib/formula-engine/types";
import { safeNumericCast } from "./safeNumericCast";

export type MetricClauseMetric = {
  field: string;
  func: string;
  alias: string;
  cast?: "numeric" | "sanitize";
  expression?: string;
  formula?: string;
  condition?: { field: string; operator: string; value: unknown };
};

export function buildPgMetricClauses(params: {
  bodyMetrics: MetricClauseMetric[];
  metricsBase: MetricClauseMetric[];
  derivedByName: Record<string, DerivedColumnRef>;
  savedMetricByName: Record<string, { field: string; func: string; expression?: string }>;
  getDerived: (field: string | undefined) => DerivedColumnRef | undefined;
  exprToSql: (e: string) => string | null;
  buildWhenClause: (cond: { field: string; operator: string; value: unknown }) => string;
  buildConditionExpr: (cond: { field: string; operator: string; value: unknown }, thenExpr: string) => string;
}): { metricClauses: string; ratioAggregateError: boolean } {
  const {
    bodyMetrics,
    metricsBase,
    derivedByName,
    savedMetricByName,
    getDerived,
    exprToSql,
    buildWhenClause,
    buildConditionExpr,
  } = params;

  const metricClauses = metricsBase
    .map((m) => {
      const i = bodyMetrics.indexOf(m);
      const derived: DerivedColumnRef | undefined = getDerived(m.field);
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
        isCompoundAggregate =
          !unwrapped &&
          /\b(SUM|AVG|COUNT|COUNTA|MIN|MAX|MEDIAN|MODE|STDEV|STDEVP|VAR|VARP|COUNTIF|SUMIF|SUMIFS|COUNTIFS|MAXIFS|MINIFS|AVERAGEIF)\s*\(/i.test(
            resolvedExpr
          );
        if (unwrapped) {
          resolvedExpr = unwrapped.inner;
          if (!m.func || m.func === "SUM") func = unwrapped.func;
        }
      }

      const effectiveField = !resolvedExpr && savedMetric?.field ? savedMetric.field : m.field;
      const derivedForField = getDerived(effectiveField);
      if (!resolvedExpr && derivedForField?.expression) {
        resolvedExpr = derivedForField.expression;
        if (!func || func === "SUM") func = (derivedForField.defaultAggregation || "SUM").toUpperCase();
        const unwrapped = unwrapAggExpression(resolvedExpr);
        isCompoundAggregate =
          !unwrapped &&
          /\b(SUM|AVG|COUNT|COUNTA|MIN|MAX|MEDIAN|MODE|STDEV|STDEVP|VAR|VARP|COUNTIF|SUMIF|SUMIFS|COUNTIFS|MAXIFS|MINIFS|AVERAGEIF)\s*\(/i.test(
            resolvedExpr
          );
        if (unwrapped) {
          resolvedExpr = unwrapped.inner;
          func = unwrapped.func;
        }
      }
      (m as { _compoundAggregate?: boolean })._compoundAggregate = isCompoundAggregate;

      const fieldExpr = (() => {
        if (resolvedExpr) {
          const countIfSumIfAgg = buildCountIfSumIfAggregate(resolvedExpr, derivedByName, exprToSql);
          if (countIfSumIfAgg) {
            (m as { _forceAggregate?: string })._forceAggregate = countIfSumIfAgg;
            return "1";
          }
          const ratioParsed = parseRatioExpression(resolvedExpr);
          if (ratioParsed) {
            const aggRe =
              /\b(SUM|AVG|COUNT|COUNTA|MIN|MAX|MEDIAN|MODE|STDEV|STDEVP|VAR|VARP|COUNTIF|SUMIF|SUMIFS|COUNTIFS|MAXIFS|MINIFS|AVERAGEIF)\s*\(/i;
            const numHasAgg = aggRe.test(ratioParsed.numerator);
            const denHasAgg = aggRe.test(ratioParsed.denominator);
            if (numHasAgg || denHasAgg) {
              (m as { _ratioAggregateError?: boolean })._ratioAggregateError = true;
              return "1";
            }
            const numSql = exprToSql(ratioParsed.numerator);
            const denSql = exprToSql(ratioParsed.denominator);
            if (numSql && denSql) {
              (m as { _ratioAggregate?: { numSql: string; denSql: string } })._ratioAggregate = {
                numSql: safeNumericCast(`(${numSql})`),
                denSql: safeNumericCast(`(${denSql})`),
              };
              return "1";
            }
          }
          const uniqueMatch = resolvedExpr.trim().match(/^\s*UNIQUE\s*\(([\s\S]+)\)\s*$/i);
          if (uniqueMatch) {
            const inner = uniqueMatch[1]!.trim();
            const innerSql = exprToSql(inner);
            if (innerSql) {
              const countDistinctExpr = `COUNT(DISTINCT (${innerSql}))`;
              (m as { _forceCountDistinct?: string })._forceCountDistinct = countDistinctExpr;
              return innerSql;
            }
          }
          const sqlExpr = exprToSql(resolvedExpr);
          if (sqlExpr) return safeNumericCast(`(${sqlExpr})`);
        }
        const isSavedNameAsColumn =
          savedMetric && String(effectiveField || "").trim().toLowerCase() === String(m.field || "").trim().toLowerCase();
        if (isSavedNameAsColumn && (func === "COUNT" || func.startsWith("COUNT(DISTINCT"))) {
          return "1";
        }
        if (isSavedNameAsColumn) {
          return "0";
        }
        const col = quotedColumn(effectiveField!);
        if (m.cast === "sanitize")
          return safeNumericCast(`regexp_replace(${col}::text, '[^0-9\\.-]', '', 'g')`);
        if (m.cast === "numeric") return safeNumericCast(col);
        return col;
      })();

      const internalAlias = `metric_${i}`;
      (m as { internalAlias?: string }).internalAlias = internalAlias;

      let aggExpr: string;
      const forceAggregate = (m as { _forceAggregate?: string })._forceAggregate;
      const forceCountDistinct = (m as { _forceCountDistinct?: string })._forceCountDistinct;
      const compoundAggregate = (m as { _compoundAggregate?: boolean })._compoundAggregate;
      const ratioAggregate = (m as { _ratioAggregate?: { numSql: string; denSql: string } })._ratioAggregate;
      if (ratioAggregate) {
        aggExpr = `SUM(${ratioAggregate.numSql}) / NULLIF(SUM(${ratioAggregate.denSql}), 0)`;
      } else if (forceAggregate) {
        aggExpr = forceAggregate;
      } else if (forceCountDistinct) {
        aggExpr = forceCountDistinct;
      } else if (compoundAggregate) {
        aggExpr = fieldExpr;
      } else if (m.condition) {
        const whenClause = buildWhenClause(m.condition);
        if (func === "COUNT" || func.startsWith("COUNT(DISTINCT"))
          aggExpr = `COUNT(CASE WHEN ${whenClause} THEN 1 END)`;
        else aggExpr = `${func}(${buildConditionExpr(m.condition, fieldExpr)})`;
      } else {
        if (func === "COUNTA") {
          aggExpr = `COUNT(${fieldExpr})`;
        } else if (func.startsWith("COUNT(DISTINCT")) aggExpr = `COUNT(DISTINCT ${fieldExpr})`;
        else aggExpr = `${func}(${fieldExpr})`;
      }
      return `${aggExpr} AS "${internalAlias}"`;
    })
    .join(", ");

  const ratioAggregateError = metricsBase.some((m) => (m as { _ratioAggregateError?: boolean })._ratioAggregateError);

  return { metricClauses, ratioAggregateError };
}
