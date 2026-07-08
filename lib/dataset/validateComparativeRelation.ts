import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import type {
  ComparativeFieldMapping,
  ComparativeRelationValidation,
  DateTransform,
} from "@/lib/dataset/comparativeRelation";
import { quoteSqlIdentifier, sqlDateTruncExpr } from "@/lib/dataset/comparativeRelation";
import { resolveDatasetById } from "@/lib/dataset/resolveDatasetTable";
import type { AppDbClient } from "@/lib/supabase/db-client";

export type ValidateComparativeRelationInput = {
  baseDatasetId: string;
  comparativeDatasetId: string;
  fieldMappings: ComparativeFieldMapping[];
};

function qualifiedTable(schema: string, tableName: string): string {
  const safeSchema = quoteSqlIdentifier(schema);
  const safeTable = quoteSqlIdentifier(tableName);
  return `${safeSchema}.${safeTable}`;
}

function buildKeyExprs(
  side: "base" | "comparative",
  mappings: ComparativeFieldMapping[]
): { selectExprs: string[]; groupExprs: string[] } {
  const selectExprs: string[] = [];
  const groupExprs: string[] = [];

  for (let i = 0; i < mappings.length; i++) {
    const m = mappings[i]!;
    const col = side === "base" ? m.baseColumn : m.comparativeColumn;
    const colSql = quoteSqlIdentifier(col);
    const transform = side === "base" ? m.baseDateTransform ?? "none" : "none";
    const expr = transform !== "none" ? sqlDateTruncExpr(colSql, transform as DateTransform) : colSql;
    const alias = `k${i}`;
    selectExprs.push(`${expr}::text AS ${quoteSqlIdentifier(alias)}`);
    groupExprs.push(expr);
  }

  return { selectExprs, groupExprs };
}

async function runCountQuery(sql: postgres.Sql, query: string): Promise<number> {
  const rows = await sql.unsafe<{ c: number }[]>(query);
  return Number(rows[0]?.c ?? 0);
}

export async function validateComparativeRelation(
  supabase: AppDbClient,
  input: ValidateComparativeRelationInput
): Promise<ComparativeRelationValidation> {
  const validatedAt = new Date().toISOString();

  if (!input.fieldMappings.length) {
    return { status: "blocked", validatedAt, duplicates: { count: 0 } };
  }

  const [baseDs, compDs] = await Promise.all([
    resolveDatasetById(supabase, input.baseDatasetId),
    resolveDatasetById(supabase, input.comparativeDatasetId),
  ]);

  if (!baseDs || !compDs) {
    return { status: "blocked", validatedAt, duplicates: { count: 0 } };
  }

  const dbUrl = getInternalDbUrl();
  if (!dbUrl) {
    return { status: "warning", validatedAt, duplicates: { count: 0 } };
  }

  const sql = postgres(dbUrl, { max: 1 });

  try {
    const compTable = qualifiedTable(compDs.schema, compDs.tableName);
    const baseTable = qualifiedTable(baseDs.schema, baseDs.tableName);

    const compKeys = buildKeyExprs("comparative", input.fieldMappings);
    const baseKeys = buildKeyExprs("base", input.fieldMappings);

    if (compKeys.groupExprs.length === 0) {
      return { status: "blocked", validatedAt, duplicates: { count: 0 } };
    }

    const compGroupBy = compKeys.groupExprs.join(", ");
    const dupQuery = `
      SELECT COUNT(*)::int AS c FROM (
        SELECT 1 FROM ${compTable}
        GROUP BY ${compGroupBy}
        HAVING COUNT(*) > 1
        LIMIT 100
      ) dup
    `;
    const duplicateGroups = await runCountQuery(sql, dupQuery);

    let sampleKeys: string[] | undefined;
    if (duplicateGroups > 0) {
      const sampleDupQuery = `
        SELECT ${compKeys.selectExprs.join(", ")}
        FROM ${compTable}
        GROUP BY ${compGroupBy}
        HAVING COUNT(*) > 1
        LIMIT 5
      `;
      const sampleRows = await sql.unsafe<Record<string, unknown>[]>(sampleDupQuery);
      sampleKeys = sampleRows.map((r) =>
        Object.values(r)
          .map((v) => String(v ?? ""))
          .join(" | ")
      );
    }

    if (duplicateGroups > 0) {
      return {
        status: "blocked",
        validatedAt,
        duplicates: { count: duplicateGroups, sampleKeys },
      };
    }

    const joinOn = input.fieldMappings
      .map((m) => {
        const bExpr =
          m.baseDateTransform && m.baseDateTransform !== "none"
            ? sqlDateTruncExpr(`b.${quoteSqlIdentifier(m.baseColumn)}`, m.baseDateTransform)
            : `b.${quoteSqlIdentifier(m.baseColumn)}`;
        return `${bExpr}::text = c.${quoteSqlIdentifier(m.comparativeColumn)}::text`;
      })
      .join(" AND ");

    const baseUnmatchedQuery = `
      SELECT COUNT(*)::int AS c FROM (
        SELECT 1 FROM ${baseTable} b
        WHERE NOT EXISTS (SELECT 1 FROM ${compTable} c WHERE ${joinOn})
        LIMIT 10000
      ) u
    `;

    const compUnmatchedQuery = `
      SELECT COUNT(*)::int AS c FROM (
        SELECT 1 FROM ${compTable} c
        WHERE NOT EXISTS (SELECT 1 FROM ${baseTable} b WHERE ${joinOn})
        LIMIT 10000
      ) u
    `;

    let baseWithoutMatch = 0;
    let comparativeWithoutBase = 0;

    try {
      baseWithoutMatch = await runCountQuery(sql, baseUnmatchedQuery);
    } catch {
      baseWithoutMatch = 0;
    }

    try {
      comparativeWithoutBase = await runCountQuery(sql, compUnmatchedQuery);
    } catch {
      comparativeWithoutBase = 0;
    }

    const hasWarnings = baseWithoutMatch > 0 || comparativeWithoutBase > 0;

    return {
      status: hasWarnings ? "warning" : "ok",
      validatedAt,
      duplicates: { count: 0 },
      ...(baseWithoutMatch > 0 ? { baseWithoutMatch: { count: baseWithoutMatch } } : {}),
      ...(comparativeWithoutBase > 0 ? { comparativeWithoutBase: { count: comparativeWithoutBase } } : {}),
    };
  } finally {
    await sql.end();
  }
}
