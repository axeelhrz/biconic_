import { parseCriterion, splitArgs, toSqlLiteral } from "./helpers";
import type { DerivedColumnRef } from "./types";

export type ExpressionToSqlFn = (expression: string) => string | null;

/** Construye la expresión SQL de agregación para COUNTIF/SUMIF/COUNTIFS/SUMIFS/AVERAGEIF/MAXIFS/MINIFS. Devuelve null si no aplica. */
export function buildCountIfSumIfAggregate(
  expression: string,
  derivedLookup: Record<string, DerivedColumnRef> | undefined,
  expressionToSql: ExpressionToSqlFn
): string | null {
  const trimmed = expression.replace(/\s+/g, " ").trim().replace(/;/g, ",");
  const countIfMatch = trimmed.match(/^\s*COUNTIF\s*\(([\s\S]+)\)\s*$/i);
  if (countIfMatch) {
    const args = splitArgs(countIfMatch[1]!);
    if (args.length < 2) return null;
    const rangeSql = expressionToSql(args[0]!);
    const crit = parseCriterion(args[1]!);
    const valSql = expressionToSql(args[1]!) ?? toSqlLiteral(crit.valueStr.replace(/^['"]|['"]$/g, ""));
    if (!rangeSql) return null;
    const whenClause =
      crit.op === "="
        ? `${rangeSql} = ${valSql}`
        : crit.op === "<>" || crit.op === "!="
          ? `${rangeSql} <> ${valSql}`
          : `${rangeSql} ${crit.op} ${valSql}`;
    return `COUNT(CASE WHEN ${whenClause} THEN 1 END)`;
  }
  const sumIfMatch = trimmed.match(/^\s*SUMIF\s*\(([\s\S]+)\)\s*$/i);
  if (sumIfMatch) {
    const args = splitArgs(sumIfMatch[1]!);
    if (args.length < 2) return null;
    const rangeSql = expressionToSql(args[0]!);
    const crit = parseCriterion(args[1]!);
    const valSql = expressionToSql(args[1]!) ?? toSqlLiteral(crit.valueStr.replace(/^['"]|['"]$/g, ""));
    const whenClause =
      crit.op === "="
        ? `${rangeSql} = ${valSql}`
        : crit.op === "<>" || crit.op === "!="
          ? `${rangeSql} <> ${valSql}`
          : `${rangeSql} ${crit.op} ${valSql}`;
    const sumRangeSql = args.length >= 3 ? expressionToSql(args[2]!) : rangeSql;
    if (!rangeSql || !sumRangeSql) return null;
    return `SUM(CASE WHEN ${whenClause} THEN ${sumRangeSql} ELSE 0 END)`;
  }
  const countIfsMatch = trimmed.match(/^\s*COUNTIFS\s*\(([\s\S]+)\)\s*$/i);
  if (countIfsMatch) {
    const args = splitArgs(countIfsMatch[1]!);
    if (args.length < 2 || args.length % 2 !== 0) return null;
    const conditions: string[] = [];
    for (let i = 0; i < args.length; i += 2) {
      const rangeSql = expressionToSql(args[i]!);
      const crit = parseCriterion(args[i + 1]!);
      const valSql =
        expressionToSql(args[i + 1]!) ?? toSqlLiteral(crit.valueStr.replace(/^['"]|['"]$/g, ""));
      if (!rangeSql) return null;
      const whenClause =
        crit.op === "="
          ? `${rangeSql} = ${valSql}`
          : crit.op === "<>" || crit.op === "!="
            ? `${rangeSql} <> ${valSql}`
            : `${rangeSql} ${crit.op} ${valSql}`;
      conditions.push(whenClause);
    }
    return `COUNT(CASE WHEN ${conditions.join(" AND ")} THEN 1 END)`;
  }
  const sumIfsMatch = trimmed.match(/^\s*SUMIFS\s*\(([\s\S]+)\)\s*$/i);
  if (sumIfsMatch) {
    const args = splitArgs(sumIfsMatch[1]!);
    if (args.length < 3 || (args.length - 1) % 2 !== 0) return null;
    const sumRangeSql = expressionToSql(args[0]!);
    if (!sumRangeSql) return null;
    const conditions: string[] = [];
    for (let i = 1; i < args.length; i += 2) {
      const rangeSql = expressionToSql(args[i]!);
      const crit = parseCriterion(args[i + 1]!);
      const valSql =
        expressionToSql(args[i + 1]!) ?? toSqlLiteral(crit.valueStr.replace(/^['"]|['"]$/g, ""));
      if (!rangeSql) return null;
      const whenClause =
        crit.op === "="
          ? `${rangeSql} = ${valSql}`
          : crit.op === "<>" || crit.op === "!="
            ? `${rangeSql} <> ${valSql}`
            : `${rangeSql} ${crit.op} ${valSql}`;
      conditions.push(whenClause);
    }
    return `SUM(CASE WHEN ${conditions.join(" AND ")} THEN ${sumRangeSql} ELSE 0 END)`;
  }
  const averageIfMatch = trimmed.match(/^\s*AVERAGEIF\s*\(([\s\S]+)\)\s*$/i);
  if (averageIfMatch) {
    const args = splitArgs(averageIfMatch[1]!);
    if (args.length < 2) return null;
    const rangeSql = expressionToSql(args[0]!);
    const crit = parseCriterion(args[1]!);
    const valSql = expressionToSql(args[1]!) ?? toSqlLiteral(crit.valueStr.replace(/^['"]|['"]$/g, ""));
    const whenClause =
      crit.op === "="
        ? `${rangeSql} = ${valSql}`
        : crit.op === "<>" || crit.op === "!="
          ? `${rangeSql} <> ${valSql}`
          : `${rangeSql} ${crit.op} ${valSql}`;
    const avgRangeSql = args.length >= 3 ? expressionToSql(args[2]!) : rangeSql;
    if (!rangeSql || !avgRangeSql) return null;
    return `AVG(CASE WHEN ${whenClause} THEN ${avgRangeSql} END)`;
  }
  const maxIfsMatch = trimmed.match(/^\s*MAXIFS\s*\(([\s\S]+)\)\s*$/i);
  if (maxIfsMatch) {
    const args = splitArgs(maxIfsMatch[1]!);
    if (args.length < 3 || (args.length - 1) % 2 !== 0) return null;
    const maxRangeSql = expressionToSql(args[0]!);
    if (!maxRangeSql) return null;
    const conditions: string[] = [];
    for (let i = 1; i < args.length; i += 2) {
      const rangeSql = expressionToSql(args[i]!);
      const crit = parseCriterion(args[i + 1]!);
      const valSql =
        expressionToSql(args[i + 1]!) ?? toSqlLiteral(crit.valueStr.replace(/^['"]|['"]$/g, ""));
      if (!rangeSql) return null;
      const whenClause =
        crit.op === "="
          ? `${rangeSql} = ${valSql}`
          : crit.op === "<>" || crit.op === "!="
            ? `${rangeSql} <> ${valSql}`
            : `${rangeSql} ${crit.op} ${valSql}`;
      conditions.push(whenClause);
    }
    return `MAX(CASE WHEN ${conditions.join(" AND ")} THEN ${maxRangeSql} END)`;
  }
  const minIfsMatch = trimmed.match(/^\s*MINIFS\s*\(([\s\S]+)\)\s*$/i);
  if (minIfsMatch) {
    const args = splitArgs(minIfsMatch[1]!);
    if (args.length < 3 || (args.length - 1) % 2 !== 0) return null;
    const minRangeSql = expressionToSql(args[0]!);
    if (!minRangeSql) return null;
    const conditions: string[] = [];
    for (let i = 1; i < args.length; i += 2) {
      const rangeSql = expressionToSql(args[i]!);
      const crit = parseCriterion(args[i + 1]!);
      const valSql =
        expressionToSql(args[i + 1]!) ?? toSqlLiteral(crit.valueStr.replace(/^['"]|['"]$/g, ""));
      if (!rangeSql) return null;
      const whenClause =
        crit.op === "="
          ? `${rangeSql} = ${valSql}`
          : crit.op === "<>" || crit.op === "!="
            ? `${rangeSql} <> ${valSql}`
            : `${rangeSql} ${crit.op} ${valSql}`;
      conditions.push(whenClause);
    }
    return `MIN(CASE WHEN ${conditions.join(" AND ")} THEN ${minRangeSql} END)`;
  }
  return null;
}
