import type { CompareSpec } from "@/lib/dashboard/compareSpec";
import { getRowValue, resolveRowColumnKey } from "@/lib/dashboard/compareMetricRows";
import {
  formatDateByGranularity,
  formatMonthYearEnLabel,
  parseDateLike,
  type DateGranularity,
  type ParseDateLikeOptions,
} from "@/lib/dashboard/dateFormatting";
import type {
  ComparativeFieldMapping,
  ComparativeRelation,
  ComparativeValueType,
  DateTransform,
} from "@/lib/dataset/comparativeRelation";
import {
  comparativeOutputColumns,
  normalizeComparativeBaseColumnKey,
} from "@/lib/dataset/comparativeRelation";

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function norm(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

/** Resuelve columna incluso si el mapeo guarda FECHACOMPROBANTE y la fila tiene join_0_fechacomprobante. */
function getComparativeSideValue(
  row: Record<string, unknown>,
  col: string
): unknown {
  const direct = getRowValue(row, col);
  if (direct !== undefined) return direct;
  const target = normalizeComparativeBaseColumnKey(col);
  if (!target) return undefined;
  const found = Object.keys(row).find((k) => normalizeComparativeBaseColumnKey(k) === target);
  return found != null ? row[found] : undefined;
}

function transformComparativeKeyValue(
  raw: unknown,
  transform: DateTransform | undefined,
  parseOpts?: ParseDateLikeOptions
): string {
  if (raw == null) return "";
  if (transform === "monthYear") {
    return formatMonthYearEnLabel(raw, parseOpts) ?? String(raw).trim();
  }
  return String(raw).trim();
}

function transformBaseKeyValue(
  raw: unknown,
  transform: DateTransform | undefined,
  parseOpts?: ParseDateLikeOptions
): string {
  if (raw == null) return "";
  if (!transform || transform === "none") return String(raw).trim();

  if (transform === "monthYear") {
    return formatMonthYearEnLabel(raw, parseOpts) ?? String(raw).trim();
  }

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
  if (mappings.length === 0) return "";
  const parts: string[] = [];
  for (const m of mappings) {
    const col = side === "base" ? m.baseColumn : m.comparativeColumn;
    const raw = side === "base" ? getComparativeSideValue(row, col) : getRowValue(row, col);
    const val =
      side === "base"
        ? transformBaseKeyValue(raw, m.baseDateTransform, parseOpts)
        : transformComparativeKeyValue(raw, m.baseDateTransform, parseOpts);
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
  /** Si se omite, usa todos los mapeos de la relación. [] = total vs total. */
  activeMappings?: ComparativeFieldMapping[];
  parseOpts?: ParseDateLikeOptions;
}): Record<string, unknown>[] {
  const { baseRows, comparativeRows, relation, compareSpec, metricAliases, parseOpts } = params;
  const mappings = params.activeMappings ?? relation.fieldMappings;

  const measureField = relation.comparativeFields.find((f) => f.column === compareSpec.comparativeField);
  const valueType: ComparativeValueType = measureField?.valueType ?? "absolute";
  const compCol = compareSpec.comparativeField;

  const compMap = new Map<string, number>();
  for (const row of comparativeRows) {
    const key = buildComparativeJoinKey(row, mappings, "comparative", parseOpts);
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
    const joinKey = buildComparativeJoinKey(row, mappings, "base", parseOpts);
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
  /** Mapeos activos del análisis. Si se omite, usa todos. [] = total sin GROUP BY. */
  activeMappings?: ComparativeFieldMapping[];
}): string {
  const { schema, tableName, relation, comparativeField, valueType } = params;
  const mappings = params.activeMappings ?? relation.fieldMappings;
  const safeSchema = schema.replace(/"/g, '""');
  const safeTable = tableName.replace(/"/g, '""');
  const table = `"${safeSchema}"."${safeTable}"`;

  const measureCol = `"${comparativeField.replace(/"/g, '""')}"`;
  const aggFunc = valueType === "percent" ? "AVG" : "SUM";
  const safeAlias = comparativeField.replace(/"/g, '""');

  if (mappings.length === 0) {
    // Total 100% del dataset comparativo (sin dimensiones en el análisis).
    return `SELECT ${aggFunc}(${measureCol}::numeric) AS "${safeAlias}" FROM ${table}`;
  }

  const groupParts = mappings.map((m) => `"${m.comparativeColumn.replace(/"/g, '""')}"`);
  const selectGroup = groupParts
    .map((g, i) => `${g}::text AS "${mappings[i]!.comparativeColumn.replace(/"/g, '""')}"`)
    .join(", ");

  // Sin whitespace inicial: public.execute_sql exige ^(SELECT|WITH)\s
  return `SELECT ${selectGroup}, ${aggFunc}(${measureCol}::numeric) AS "${safeAlias}" FROM ${table} GROUP BY ${groupParts.join(", ")}`;
}
