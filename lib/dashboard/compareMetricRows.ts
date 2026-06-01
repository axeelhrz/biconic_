import type { CompareSpec, CompareTemporalMode } from "@/lib/dashboard/compareSpec";
import {
  formatDateByGranularity,
  parseDateLike,
  parseIsoYearMonthForLabel,
  type DateGranularity,
  type ParseDateLikeOptions,
} from "@/lib/dashboard/dateFormatting";

const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();

export function resolveRowColumnKey(row: Record<string, unknown>, col: string): string | null {
  if (!col) return null;
  if (Object.prototype.hasOwnProperty.call(row, col)) return col;
  const t = norm(col);
  const found = Object.keys(row).find((k) => norm(k) === t);
  return found ?? null;
}

export function getRowValue(row: Record<string, unknown>, col: string): unknown {
  const k = resolveRowColumnKey(row, col);
  return k != null ? row[k] : undefined;
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function deltaPct(current: number | null, ref: number | null): number | null {
  if (current == null || ref == null) return null;
  if (ref === 0) return current === 0 ? 0 : null;
  return ((current - ref) / ref) * 100;
}

/** Etiqueta de periodo un año antes (misma representación que en filas de agregación). */
export function shiftBucketLabelOneYear(
  raw: unknown,
  gran: DateGranularity,
  parseOpts?: ParseDateLikeOptions
): string | null {
  if (raw == null) return null;
  const s = typeof raw === "string" ? raw.trim() : String(raw).trim();
  if (!s && typeof raw !== "string") return null;

  if (gran === "quarter") {
    const m = /^T(\d)\s*\/\s*(\d{4})$/i.exec(s.replace(/\s+/g, ""));
    if (m) return `T${m[1]}/${Number(m[2]) - 1}`;
  }
  if (gran === "semester") {
    const m = /^S(\d)\s*\/\s*(\d{4})$/i.exec(s.replace(/\s+/g, ""));
    if (m) return `S${m[1]}/${Number(m[2]) - 1}`;
  }
  if (gran === "year") {
    const y = Number(s);
    if (Number.isFinite(y)) return String(y - 1);
  }
  if (gran === "month") {
    const iso = parseIsoYearMonthForLabel(s);
    if (iso) return `${iso.year - 1}-${String(iso.month).padStart(2, "0")}`;
  }

  const d = parseDateLike(typeof raw === "string" ? raw : s, parseOpts);
  if (!d) return null;
  const y2 = d.getUTCFullYear() - 1;
  const d2 = new Date(Date.UTC(y2, d.getUTCMonth(), d.getUTCDate()));
  return formatDateByGranularity(d2, gran === "day" || gran === "week" ? gran : "month", undefined, parseOpts);
}

/** Inicio UTC del bucket (para desplazamientos de calendario). */
function bucketStartUtc(value: unknown, gran: DateGranularity, parseOpts?: ParseDateLikeOptions): Date | null {
  const t = compareBucketSortTime(value, gran, parseOpts);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

/**
 * Etiqueta del periodo calendario anterior (según granularidad), para buscar en el mapa de filas.
 */
export function shiftCalendarBucketLabel(
  raw: unknown,
  gran: DateGranularity,
  mode: "calendar_prev_day" | "calendar_prev_week" | "calendar_prev_month" | "calendar_prev_year",
  parseOpts?: ParseDateLikeOptions
): string | null {
  if (mode === "calendar_prev_year") {
    return shiftBucketLabelOneYear(raw, gran, parseOpts);
  }
  const start = bucketStartUtc(raw, gran, parseOpts);
  if (!start) return null;
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  const day = start.getUTCDate();
  if (mode === "calendar_prev_day") {
    const d2 = new Date(Date.UTC(y, m, day - 1));
    return formatDateByGranularity(d2, gran === "month" ? "day" : gran, undefined, parseOpts);
  }
  if (mode === "calendar_prev_week") {
    const d2 = new Date(Date.UTC(y, m, day - 7));
    return formatDateByGranularity(d2, gran, undefined, parseOpts);
  }
  // calendar_prev_month
  if (gran === "month") {
    const iso = parseIsoYearMonthForLabel(raw);
    if (iso) {
      let month = iso.month - 1;
      let year = iso.year;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
      return `${year}-${String(month).padStart(2, "0")}`;
    }
  }
  const d2 = new Date(Date.UTC(y, m - 1, 1));
  return formatDateByGranularity(d2, gran === "day" || gran === "week" ? gran : "month", undefined, parseOpts);
}

/** Orden cronológico de etiquetas de bucket (exportado para KPI / selección de fila). */
export function compareBucketSortTime(value: unknown, gran: DateGranularity, parseOpts?: ParseDateLikeOptions): number {
  if (value == null) return NaN;
  const s = typeof value === "string" ? value.trim() : String(value);
  if (gran === "quarter") {
    const m = /^T(\d)\s*\/\s*(\d{4})$/i.exec(s.replace(/\s+/g, ""));
    if (m) {
      const q = Number(m[1]);
      const y = Number(m[2]);
      return Date.UTC(y, (q - 1) * 3, 1);
    }
  }
  if (gran === "semester") {
    const m = /^S(\d)\s*\/\s*(\d{4})$/i.exec(s.replace(/\s+/g, ""));
    if (m) {
      const s1 = Number(m[1]);
      const y = Number(m[2]);
      return Date.UTC(y, s1 === 1 ? 0 : 6, 1);
    }
  }
  if (gran === "year") {
    const y = Number(s);
    if (Number.isFinite(y)) return Date.UTC(y, 0, 1);
  }
  const d = parseDateLike(value, parseOpts);
  return d ? d.getTime() : NaN;
}

function partitionKey(row: Record<string, unknown>, dimCols: string[], exclude?: string): string {
  const ex = exclude ? norm(exclude) : "";
  const parts: string[] = [];
  for (const c of dimCols) {
    if (!c || norm(c) === ex) continue;
    const k = resolveRowColumnKey(row, c);
    parts.push(`${k ?? c}:${String(k != null ? row[k!] : "")}`);
  }
  return parts.join("\t");
}

function attachTemporalLag(
  rows: Record<string, unknown>[],
  metricAliases: string[],
  timeColumn: string,
  granularity: DateGranularity,
  dimensionColumns: string[],
  mode: "prev_bucket" | "same_period_prior_year",
  parseOpts?: ParseDateLikeOptions
): Record<string, unknown>[] {
  const timeResolved = timeColumn;
  if (mode === "prev_bucket") {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const pk = partitionKey(row, dimensionColumns, timeColumn);
      if (!groups.has(pk)) groups.set(pk, []);
      groups.get(pk)!.push(row);
    }
    const enriched = new WeakMap<Record<string, unknown>, Record<string, unknown>>();
    for (const groupRows of groups.values()) {
      const sorted = [...groupRows].sort(
        (a, b) =>
          compareBucketSortTime(getRowValue(a, timeResolved), granularity, parseOpts) -
          compareBucketSortTime(getRowValue(b, timeResolved), granularity, parseOpts)
      );
      for (let i = 0; i < sorted.length; i++) {
        const base = sorted[i]!;
        const row = { ...base };
        const prevRow = i > 0 ? sorted[i - 1]! : null;
        for (const alias of metricAliases) {
          const k = resolveRowColumnKey(row, alias);
          if (!k) continue;
          const v = toNum(row[k]);
          const vPrev = prevRow ? toNum(getRowValue(prevRow, alias)) : null;
          row[`${k}_prev`] = vPrev;
          row[`${k}_delta`] = v != null && vPrev != null ? v - vPrev : null;
          row[`${k}_delta_pct`] = deltaPct(v, vPrev);
        }
        enriched.set(base, row);
      }
    }
    return rows.map((r) => enriched.get(r) ?? { ...r });
  }

  // same_period_prior_year: map (partition + time label) -> row metrics
  const mapPrev = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const tVal = getRowValue(row, timeResolved);
    const pk = partitionKey(row, dimensionColumns, timeColumn);
    const key = `${pk}\t${String(tVal ?? "")}`;
    mapPrev.set(key, row);
  }

  const enriched = new WeakMap<Record<string, unknown>, Record<string, unknown>>();
  for (const row of rows) {
    const next = { ...row };
    const tVal = getRowValue(row, timeResolved);
    const pk = partitionKey(row, dimensionColumns, timeColumn);
    const shifted = shiftBucketLabelOneYear(tVal, granularity, parseOpts);
    const lookKey = shifted != null ? `${pk}\t${shifted}` : null;
    const prevRow = lookKey ? mapPrev.get(lookKey) : undefined;
    for (const alias of metricAliases) {
      const k = resolveRowColumnKey(next, alias);
      if (!k) continue;
      const v = toNum(next[k]);
      const vPrev = prevRow ? toNum(getRowValue(prevRow, alias)) : null;
      next[`${k}_prev`] = vPrev;
      next[`${k}_delta`] = v != null && vPrev != null ? v - vPrev : null;
      next[`${k}_delta_pct`] = deltaPct(v, vPrev);
    }
    enriched.set(row, next);
  }
  return rows.map((r) => enriched.get(r) ?? { ...r });
}

function attachTemporalCalendarLookup(
  rows: Record<string, unknown>[],
  metricAliases: string[],
  timeColumn: string,
  granularity: DateGranularity,
  dimensionColumns: string[],
  mode: "calendar_prev_day" | "calendar_prev_week" | "calendar_prev_month" | "calendar_prev_year",
  parseOpts?: ParseDateLikeOptions
): Record<string, unknown>[] {
  const timeResolved = timeColumn;
  const mapPrev = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const tVal = getRowValue(row, timeResolved);
    const pk = partitionKey(row, dimensionColumns, timeColumn);
    mapPrev.set(`${pk}\t${String(tVal ?? "")}`, row);
  }
  const enriched = new WeakMap<Record<string, unknown>, Record<string, unknown>>();
  for (const row of rows) {
    const next = { ...row };
    const tVal = getRowValue(row, timeResolved);
    const pk = partitionKey(row, dimensionColumns, timeColumn);
    const shifted = shiftCalendarBucketLabel(tVal, granularity, mode, parseOpts);
    const lookKey = shifted != null ? `${pk}\t${shifted}` : null;
    const prevRow = lookKey ? mapPrev.get(lookKey) : undefined;
    for (const alias of metricAliases) {
      const k = resolveRowColumnKey(next, alias);
      if (!k) continue;
      const v = toNum(next[k]);
      const vPrev = prevRow ? toNum(getRowValue(prevRow, alias)) : null;
      next[`${k}_prev`] = vPrev;
      next[`${k}_delta`] = v != null && vPrev != null ? v - vPrev : null;
      next[`${k}_delta_pct`] = deltaPct(v, vPrev);
    }
    enriched.set(row, next);
  }
  return rows.map((r) => enriched.get(r) ?? { ...r });
}

function attachFixed(rows: Record<string, unknown>[], metricAliases: string[], fixed: number): Record<string, unknown>[] {
  return rows.map((row) => {
    const next = { ...row };
    for (const alias of metricAliases) {
      const k = resolveRowColumnKey(next, alias);
      if (!k) continue;
      const v = toNum(next[k]);
      if (v != null && Number.isFinite(v)) {
        next[`${k}_vs_fijo`] = v - fixed;
        next[`${k}_var_pct_fijo`] = fixed !== 0 ? ((v - fixed) / fixed) * 100 : v === 0 ? 0 : null;
      }
    }
    return next;
  });
}

function attachColumnCompare(rows: Record<string, unknown>[], metricAliases: string[], refColumn: string): Record<string, unknown>[] {
  return rows.map((row) => {
    const next = { ...row };
    const refK = resolveRowColumnKey(next, refColumn);
    const refVal = refK != null ? toNum(next[refK]) : null;
    for (const alias of metricAliases) {
      const k = resolveRowColumnKey(next, alias);
      if (!k || k === refK) continue;
      const v = toNum(next[k]);
      next[`${k}_vs_col`] = v != null && refVal != null ? v - refVal : null;
      next[`${k}_delta_pct_col`] = deltaPct(v, refVal);
    }
    return next;
  });
}

function attachAverage(
  rows: Record<string, unknown>[],
  metricAliases: string[],
  scope: "global" | "partition",
  partitionDimensions: string[]
): Record<string, unknown>[] {
  const avgs = new Map<string, Map<string, { sum: number; n: number }>>();

  const groupKey = (row: Record<string, unknown>) =>
    scope === "global" ? "__all__" : partitionKey(row, partitionDimensions, undefined);

  for (const row of rows) {
    const gk = groupKey(row);
    if (!avgs.has(gk)) avgs.set(gk, new Map());
    const m = avgs.get(gk)!;
    for (const alias of metricAliases) {
      const k = resolveRowColumnKey(row, alias);
      if (!k) continue;
      const v = toNum(row[k]);
      if (v == null) continue;
      const cur = m.get(k) ?? { sum: 0, n: 0 };
      cur.sum += v;
      cur.n += 1;
      m.set(k, cur);
    }
  }

  const meanFor = (gk: string, aliasKey: string): number | null => {
    const rec = avgs.get(gk)?.get(aliasKey);
    if (!rec || rec.n === 0) return null;
    return rec.sum / rec.n;
  };

  return rows.map((row) => {
    const next = { ...row };
    const gk = groupKey(row);
    for (const alias of metricAliases) {
      const k = resolveRowColumnKey(next, alias);
      if (!k) continue;
      const v = toNum(next[k]);
      const mu = meanFor(gk, k);
      next[`${k}_vs_prom`] = v != null && mu != null ? v - mu : null;
      next[`${k}_delta_pct_prom`] = deltaPct(v, mu);
    }
    return next;
  });
}

function attachTotalShare(
  rows: Record<string, unknown>[],
  metricAliases: string[],
  partitionDimensions: string[]
): Record<string, unknown>[] {
  const sums = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const gk = partitionDimensions.length ? partitionKey(row, partitionDimensions, undefined) : "__all__";
    if (!sums.has(gk)) sums.set(gk, new Map());
    const m = sums.get(gk)!;
    for (const alias of metricAliases) {
      const k = resolveRowColumnKey(row, alias);
      if (!k) continue;
      const v = toNum(row[k]);
      if (v == null) continue;
      m.set(k, (m.get(k) ?? 0) + v);
    }
  }

  return rows.map((row) => {
    const next = { ...row };
    const gk = partitionDimensions.length ? partitionKey(row, partitionDimensions, undefined) : "__all__";
    const sm = sums.get(gk) ?? new Map();
    for (const alias of metricAliases) {
      const k = resolveRowColumnKey(next, alias);
      if (!k) continue;
      const v = toNum(next[k]);
      const total = sm.get(k);
      next[`${k}_pct_total`] =
        v != null && total != null && total !== 0 ? (v / total) * 100 : v != null && total === 0 ? 0 : null;
      if (total != null) next[`${k}_total_ref`] = total;
    }
    return next;
  });
}

function extractYearMonthFromBucket(
  raw: unknown,
  gran: DateGranularity,
  parseOpts?: ParseDateLikeOptions
): { year: number; month1: number } | null {
  const d = parseDateLike(raw, parseOpts);
  if (d) return { year: d.getUTCFullYear(), month1: d.getUTCMonth() + 1 };
  const iso = parseIsoYearMonthForLabel(raw);
  if (iso) return { year: iso.year, month1: iso.month };
  if (gran === "quarter" && typeof raw === "string") {
    const m = /^T(\d)\s*\/\s*(\d{4})$/i.exec(raw.trim().replace(/\s+/g, ""));
    if (m) return { year: Number(m[2]), month1: (Number(m[1]) - 1) * 3 + 1 };
  }
  if (gran === "year" && typeof raw === "string") {
    const y = Number(raw.trim());
    if (Number.isFinite(y)) return { year: y, month1: 1 };
  }
  return null;
}

function attachCumulativeCompare(
  rows: Record<string, unknown>[],
  metricAliases: string[],
  timeColumn: string,
  granularity: DateGranularity,
  dimensionColumns: string[],
  mode: "month_vs_ytd" | "vs_prior_year_ytd" | "ytd_running",
  parseOpts?: ParseDateLikeOptions
): Record<string, unknown>[] {
  const timeResolved = timeColumn;
  const yearPartition = (row: Record<string, unknown>) => {
    const ym = extractYearMonthFromBucket(getRowValue(row, timeResolved), granularity, parseOpts);
    const y = ym?.year ?? NaN;
    return `${partitionKey(row, dimensionColumns, timeColumn)}\t${y}`;
  };

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const gk = yearPartition(row);
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk)!.push(row);
  }

  /** YTD acumulado por fila y alias de métrica */
  const ytdByRowMetric = new WeakMap<Record<string, unknown>, Record<string, number>>();
  const ytdIndex = new Map<string, number>();

  for (const groupRows of groups.values()) {
    const sorted = [...groupRows].sort(
      (a, b) =>
        compareBucketSortTime(getRowValue(a, timeResolved), granularity, parseOpts) -
        compareBucketSortTime(getRowValue(b, timeResolved), granularity, parseOpts)
    );
    const runByAlias: Record<string, number> = {};
    for (const row of sorted) {
      const perRow: Record<string, number> = {};
      for (const alias of metricAliases) {
        const k = resolveRowColumnKey(row, alias);
        if (!k) continue;
        const v = toNum(row[k]);
        if (v == null) continue;
        runByAlias[k] = (runByAlias[k] ?? 0) + v;
        perRow[k] = runByAlias[k]!;
      }
      ytdByRowMetric.set(row, perRow);
      if (mode === "vs_prior_year_ytd") {
        const ym = extractYearMonthFromBucket(getRowValue(row, timeResolved), granularity, parseOpts);
        const pk = partitionKey(row, dimensionColumns, timeColumn);
        if (ym) {
          for (const alias of metricAliases) {
            const k = resolveRowColumnKey(row, alias);
            if (!k) continue;
            const ytd = perRow[k];
            if (ytd == null) continue;
            ytdIndex.set(`${pk}\t${ym.year}\t${ym.month1}\t${k}`, ytd);
          }
        }
      }
    }
  }

  return rows.map((row) => {
    const next = { ...row };
    const ym = extractYearMonthFromBucket(getRowValue(row, timeResolved), granularity, parseOpts);
    const pk = partitionKey(row, dimensionColumns, timeColumn);
    const ytdMap = ytdByRowMetric.get(row) ?? {};
    for (const alias of metricAliases) {
      const k = resolveRowColumnKey(next, alias);
      if (!k) continue;
      const v = toNum(next[k]);
      const ytd = ytdMap[k];
      if ((mode === "ytd_running" || mode === "month_vs_ytd" || mode === "vs_prior_year_ytd") && ytd != null) {
        next[`${k}_ytd`] = ytd;
      }
      if (mode === "month_vs_ytd" && v != null && ytd != null && ytd !== 0) {
        next[`${k}_pct_mes_en_ytd`] = (v / ytd) * 100;
      }
      if (mode === "vs_prior_year_ytd" && ym) {
        const lyKey = `${pk}\t${ym.year - 1}\t${ym.month1}\t${k}`;
        const ytdLy = ytdIndex.get(lyKey);
        next[`${k}_vs_ytd_ly`] = ytd != null && ytdLy != null ? ytd - ytdLy : null;
        next[`${k}_delta_pct_ytd_yoy`] = deltaPct(ytd ?? null, ytdLy ?? null);
      }
      if (mode === "ytd_running" && ytd != null) {
        next[`${k}_ytd_run`] = ytd;
      }
    }
    return next;
  });
}

export type ApplyCompareRowsOptions = {
  parseDateOpts?: ParseDateLikeOptions;
  /** Columnas de dimensión presentes en cada fila (orden estable). Debe incluir la columna temporal si aplica. */
  dimensionColumns: string[];
};

/**
 * Aplica comparaciones sobre filas ya mapeadas a alias de métricas visibles.
 */
export function applyCompareSpecToRows(
  rows: Record<string, unknown>[],
  metricAliases: string[],
  spec: CompareSpec,
  opts: ApplyCompareRowsOptions
): Record<string, unknown>[] {
  if (!rows.length || spec.kind === "none") return rows.map((r) => ({ ...r }));

  const dimCols = opts.dimensionColumns ?? [];

  if (spec.kind === "fixed") {
    return attachFixed(rows, metricAliases, spec.value);
  }
  if (spec.kind === "column") {
    return attachColumnCompare(rows, metricAliases, spec.refColumn);
  }
  if (spec.kind === "average") {
    return attachAverage(rows, metricAliases, spec.scope, spec.partitionDimensions);
  }
  if (spec.kind === "total_share") {
    return attachTotalShare(rows, metricAliases, spec.partitionDimensions);
  }
  if (spec.kind === "cumulative") {
    return attachCumulativeCompare(
      rows,
      metricAliases,
      spec.timeColumn,
      spec.granularity,
      dimCols,
      spec.mode,
      opts.parseDateOpts
    );
  }
  if (spec.kind === "temporal") {
    if (spec.mode === "prev_bucket" || spec.mode === "same_period_prior_year") {
      return attachTemporalLag(
        rows,
        metricAliases,
        spec.timeColumn,
        spec.granularity,
        dimCols,
        spec.mode,
        opts.parseDateOpts
      );
    }
    if (
      spec.mode === "calendar_prev_day" ||
      spec.mode === "calendar_prev_week" ||
      spec.mode === "calendar_prev_month" ||
      spec.mode === "calendar_prev_year"
    ) {
      return attachTemporalCalendarLookup(
        rows,
        metricAliases,
        spec.timeColumn,
        spec.granularity,
        dimCols,
        spec.mode,
        opts.parseDateOpts
      );
    }
  }

  return rows.map((r) => ({ ...r }));
}
