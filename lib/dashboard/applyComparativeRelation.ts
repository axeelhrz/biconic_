import type { CompareSpec } from "@/lib/dashboard/compareSpec";
import { getRowValue, resolveRowColumnKey } from "@/lib/dashboard/compareMetricRows";
import { formatDateByGranularity, parseDateLike, type DateGranularity, type ParseDateLikeOptions } from "@/lib/dashboard/dateFormatting";
import type {
  ComparativeFieldMapping,
  ComparativeRelation,
  ComparativeValueType,
  DateTransform,
} from "@/lib/dataset/comparativeRelation";
import { comparativeOutputColumns } from "@/lib/dataset/comparativeRelation";

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function norm(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

function transformBaseKeyValue(
  raw: unknown,
  transform: DateTransform | undefined,
  parseOpts?: ParseDateLikeOptions
): string {
  if (raw == null) return "";
  if (!transform || transform === "none") return String(raw).trim();

  const gran = transform as DateGranularity;
  const d = parseDateLike(raw, parseOpts);
  if (d) {
    const formatted = formatDateByGranularity(d, gran, undefined, parseOpts);
    if (formatted != null) return formatted;
  }
  return String(raw).trim();
}

export function buildComparativeJoinKey(
  row: Record<string, unknown>,
  mappings: ComparativeFieldMapping[],
  side: "base" | "comparative",
  parseOpts?: ParseDateLikeOptions
): string {
  const parts: string[] = [];
  for (const m of mappings) {
    const col = side === "base" ? m.baseColumn : m.comparativeColumn;
    const raw = getRowValue(row, col);
    const val =
      side === "base"
        ? transformBaseKeyValue(raw, m.baseDateTransform, parseOpts)
        : String(raw ?? "").trim();
    parts.push(val);
  }
  return parts.join("\x01");
}

export function applyComparativeRelationToRows(params: {
  baseRows: Record<string, unknown>[];
  comparativeRows: Record<string, unknown>[];
  relation: ComparativeRelation;
  compareSpec: Extract<CompareSpec, { kind: "comparative" }>;
  metricAliases: string[];
  parseOpts?: ParseDateLikeOptions;
}): Record<string, unknown>[] {
  const { baseRows, comparativeRows, relation, compareSpec, metricAliases, parseOpts } = params;

  const measureField = relation.comparativeFields.find((f) => f.column === compareSpec.comparativeField);
  const valueType: ComparativeValueType = measureField?.valueType ?? "absolute";
  const compCol = compareSpec.comparativeField;

  const compMap = new Map<string, number>();
  for (const row of comparativeRows) {
    const key = buildComparativeJoinKey(row, relation.fieldMappings, "comparative", parseOpts);
    const colKey = resolveRowColumnKey(row, compCol) ?? compCol;
    const val = toNum(row[colKey]);
    if (val == null) continue;
    if (valueType === "percent") {
      compMap.set(key, val);
    } else {
      const prev = compMap.get(key);
      compMap.set(key, prev != null ? prev + val : val);
    }
  }

  const targetAlias =
    metricAliases.find((a) => norm(a) === norm(compareSpec.metricAlias)) ?? compareSpec.metricAlias;

  const outputCols = comparativeOutputColumns(targetAlias, valueType);

  return baseRows.map((row) => {
    const out = { ...row };
    const joinKey = buildComparativeJoinKey(row, relation.fieldMappings, "base", parseOpts);
    const metricKey = resolveRowColumnKey(row, targetAlias) ?? targetAlias;
    const realVal = toNum(row[metricKey]);
    const compVal = compMap.get(joinKey) ?? null;

    if (valueType === "percent") {
      out[outputCols[0]!] = realVal;
      out[outputCols[1]!] = compVal;
      out[outputCols[2]!] =
        realVal != null && compVal != null ? realVal - compVal : null;
    } else {
      out[outputCols[0]!] = realVal;
      out[outputCols[1]!] = compVal;
      const delta = realVal != null && compVal != null ? realVal - compVal : null;
      out[outputCols[2]!] = delta;
      out[outputCols[3]!] =
        delta != null && compVal != null && compVal !== 0 ? (delta / compVal) * 100 : null;
      out[outputCols[4]!] =
        realVal != null && compVal != null && compVal !== 0 ? (realVal / compVal) * 100 : null;
    }

    return out;
  });
}

export function buildComparativeAggregateSql(params: {
  schema: string;
  tableName: string;
  relation: ComparativeRelation;
  comparativeField: string;
  valueType: ComparativeValueType;
}): string {
  const { schema, tableName, relation, comparativeField, valueType } = params;
  const safeSchema = schema.replace(/"/g, '""');
  const safeTable = tableName.replace(/"/g, '""');
  const table = `"${safeSchema}"."${safeTable}"`;

  const groupParts: string[] = [];

  relation.fieldMappings.forEach((m) => {
    const col = `"${m.comparativeColumn.replace(/"/g, '""')}"`;
    groupParts.push(col);
  });

  const measureCol = `"${comparativeField.replace(/"/g, '""')}"`;
  const aggFunc = valueType === "percent" ? "AVG" : "SUM";
  const safeAlias = comparativeField.replace(/"/g, '""');

  const selectGroup = groupParts
    .map((g, i) => `${g}::text AS "${relation.fieldMappings[i]!.comparativeColumn.replace(/"/g, '""')}"`)
    .join(", ");

  return `
    SELECT ${selectGroup}, ${aggFunc}(${measureCol}::numeric) AS "${safeAlias}"
    FROM ${table}
    GROUP BY ${groupParts.join(", ")}
  `;
}
