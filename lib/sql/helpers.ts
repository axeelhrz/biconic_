// Shared SQL helper utilities for Postgres and MySQL, including star-schema variants.
// Keep aliasing conventions aligned with ETL UI: primary_*, join_{i}_*, left_*, right_*.

export type FilterCondition = {
  column: string;
  operator:
    | "="
    | "!="
    | ">"
    | ">="
    | "<"
    | "<="
    | "contains"
    | "startsWith"
    | "endsWith"
    | "in"
    | "not in"
    | "is null"
    | "is not null";
  value?: string;
};

export type JoinCondition = {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  joinType: "INNER" | "LEFT" | "RIGHT" | "FULL";
};

export function quoteIdent(
  name: string,
  dbType: "postgres" | "mysql" = "postgres"
) {
  if (!name) return dbType === "postgres" ? '""' : "``";
  return dbType === "postgres"
    ? `"${name.replace(/"/g, '""')}"`
    : `\`${name.replace(/`/g, "``")}\``;
}

export function quoteQualified(
  qname: string,
  dbType: "postgres" | "mysql" = "postgres"
) {
  if (!qname) return quoteIdent("", dbType);
  const parts = qname.split(".");
  return parts.map((p) => quoteIdent(p, dbType)).join(".");
}

// Binary join (left/right) clause builder
export function buildJoinClauseBinary(
  joinConditions: JoinCondition[],
  dbType: "postgres" | "mysql",
  rightQualified: string
) {
  const jt = joinConditions[0]?.joinType || "INNER";
  const onExpr = joinConditions
    .map(
      (jc) =>
        `l.${quoteIdent(jc.leftColumn, dbType)} = r.${quoteIdent(
          jc.rightColumn,
          dbType
        )}`
    )
    .join(" AND ");
  return `${jt} JOIN ${rightQualified} AS r ON ${onExpr}`;
}

// WHERE clause for binary join (supports left./right. prefixes)
export function buildWhereClausePg(conds: FilterCondition[] = []) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    const raw = c.column || "";
    const mLeft = raw.match(/^(left|l)\.(.+)$/i);
    const mRight = raw.match(/^(right|r)\.(.+)$/i);
    const col = mLeft
      ? `l.${quoteIdent(mLeft[2], "postgres")}`
      : mRight
      ? `r.${quoteIdent(mRight[2], "postgres")}`
      : quoteIdent(raw, "postgres");
    switch (c.operator) {
      case "is null":
        return `${col} IS NULL`;
      case "is not null":
        return `${col} IS NOT NULL`;
      case "contains":
        params.push(`%${c.value ?? ""}%`);
        return `${col} ILIKE $${params.length}`;
      case "startsWith":
        params.push(`${c.value ?? ""}%`);
        return `${col} ILIKE $${params.length}`;
      case "endsWith":
        params.push(`%${c.value ?? ""}`);
        return `${col} ILIKE $${params.length}`;
      case "in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const idxs = list.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${col} IN (${idxs.join(", ")})`;
      }
      case "not in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const idxs = list.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${col} NOT IN (${idxs.join(", ")})`;
      }
      default:
        params.push(c.value ?? null);
        return `${col} ${c.operator} $${params.length}`;
    }
  });
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

/** Date filter for ETL: AÑO → MES → DÍA (Excel-style). Returns extra WHERE fragment and params for Postgres. */
export type DateFilterSpec = {
  column: string;
  years?: number[];
  months?: number[];
  exactDates?: string[];
};

export function buildDateFilterWhereFragmentPg(
  dateFilter: DateFilterSpec | undefined | null,
  paramStartIndex: number,
  /** Optional table/alias prefix, e.g. "p." for star schema primary table */
  tablePrefix: string = "",
  /** When set, resolve primary.<name> and join_N.<name> to p. / jN. alias (star join) */
  joinsCount?: number
): { clause: string; params: any[] } {
  const params: any[] = [];
  const parts: string[] = [];
  if (!dateFilter) return { clause: "", params };
  const rawColumn = (dateFilter.column ?? "").trim();
  if (!rawColumn) return { clause: "", params };

  let col: string;
  if (joinsCount != null && joinsCount >= 0) {
    if (/^primary\./i.test(rawColumn)) {
      const name = rawColumn.replace(/^primary\./i, "").trim();
      col = `p.${quoteIdent(name, "postgres")}`;
    } else {
      const m = rawColumn.match(/^join_(\d+)\.(.+)$/i);
      if (m) {
        const i = Number(m[1]);
        const name = m[2].trim();
        if (!Number.isNaN(i) && i >= 0 && i < joinsCount)
          col = `j${i}.${quoteIdent(name, "postgres")}`;
        else
          col = tablePrefix + quoteIdent(rawColumn, "postgres");
      } else {
        col = tablePrefix + quoteIdent(rawColumn, "postgres");
      }
    }
  } else {
    col = tablePrefix + quoteIdent(rawColumn, "postgres");
  }
  const years = Array.isArray(dateFilter.years) ? dateFilter.years.map((y) => Number(y)).filter((n) => !Number.isNaN(n)) : [];
  const months = Array.isArray(dateFilter.months) ? dateFilter.months.map((m) => Number(m)).filter((n) => !Number.isNaN(n)) : [];
  const exactDates = Array.isArray(dateFilter.exactDates) ? dateFilter.exactDates.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) : [];

  // Cast column to date so comparison works for date, timestamp, or text (ISO) types
  const colAsDate = `(${col})::date`;

  let idx = paramStartIndex;

  if (years.length && months.length) {
    const rangeParts: string[] = [];
    for (const y of years) {
      for (const m of months) {
        const start = `${y}-${String(m).padStart(2, "0")}-01`;
        const endMonth = m === 12 ? 1 : m + 1;
        const endYear = m === 12 ? y + 1 : y;
        const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
        params.push(start, end);
        rangeParts.push(`(${colAsDate} >= $${idx++}::date AND ${colAsDate} < $${idx++}::date)`);
      }
    }
    parts.push(rangeParts.length === 1 ? rangeParts[0] : `(${rangeParts.join(" OR ")})`);
  } else if (years.length) {
    const rangeParts: string[] = [];
    for (const y of years) {
      params.push(`${y}-01-01`, `${y + 1}-01-01`);
      rangeParts.push(`(${colAsDate} >= $${idx++}::date AND ${colAsDate} < $${idx++}::date)`);
    }
    parts.push(rangeParts.length === 1 ? rangeParts[0] : `(${rangeParts.join(" OR ")})`);
  } else if (months.length) {
    const placeholders = months.map(() => `$${idx++}`);
    months.forEach((m) => params.push(m));
    parts.push(`EXTRACT(MONTH FROM ${colAsDate}) IN (${placeholders.join(", ")})`);
  }

  if (exactDates.length) {
    const rangeParts: string[] = [];
    for (const d of exactDates) {
      params.push(d, d);
      rangeParts.push(`(${colAsDate} >= $${idx++}::date AND ${colAsDate} < $${idx++}::date + interval '1 day')`);
    }
    parts.push(rangeParts.length === 1 ? rangeParts[0] : `(${rangeParts.join(" OR ")})`);
  }

  if (parts.length === 0) return { clause: "", params };
  return { clause: parts.join(" AND "), params };
}

/** Date filter for ETL on Firebird: returns WHERE fragment with ? placeholders and params (EXTRACT(YEAR/MONTH) or exact dates). */
export function buildDateFilterWhereFragmentFirebird(
  dateFilter: DateFilterSpec | undefined | null
): { clause: string; params: any[] } {
  const params: any[] = [];
  const parts: string[] = [];
  if (!dateFilter) return { clause: "", params };
  const rawColumn = (dateFilter.column ?? "").trim().replace(/^primary\./i, "").trim();
  if (!rawColumn) return { clause: "", params };
  const col = firebirdQuotedIdent(rawColumn);
  const years = Array.isArray(dateFilter.years) ? dateFilter.years.map((y) => Number(y)).filter((n) => !Number.isNaN(n)) : [];
  const months = Array.isArray(dateFilter.months) ? dateFilter.months.map((m) => Number(m)).filter((n) => !Number.isNaN(n)) : [];
  const exactDates = Array.isArray(dateFilter.exactDates) ? dateFilter.exactDates.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) : [];
  if (years.length) {
    parts.push(`EXTRACT(YEAR FROM ${col}) IN (${years.map(() => "?").join(", ")})`);
    years.forEach((y) => params.push(y));
  }
  if (months.length) {
    parts.push(`EXTRACT(MONTH FROM ${col}) IN (${months.map(() => "?").join(", ")})`);
    months.forEach((m) => params.push(m));
  }
  if (exactDates.length) {
    parts.push(`CAST(${col} AS DATE) IN (${exactDates.map(() => "?").join(", ")})`);
    exactDates.forEach((d) => params.push(d));
  }
  if (parts.length === 0) return { clause: "", params };
  return { clause: parts.join(" AND "), params };
}

export function buildWhereClauseMy(conds: FilterCondition[] = []) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    const raw = c.column || "";
    const mLeft = raw.match(/^(left|l)\.(.+)$/i);
    const mRight = raw.match(/^(right|r)\.(.+)$/i);
    const col = mLeft
      ? `l.${quoteIdent(mLeft[2], "mysql")}`
      : mRight
      ? `r.${quoteIdent(mRight[2], "mysql")}`
      : quoteIdent(raw, "mysql");
    switch (c.operator) {
      case "is null":
        return `${col} IS NULL`;
      case "is not null":
        return `${col} IS NOT NULL`;
      case "contains":
        params.push(`%${c.value ?? ""}%`);
        return `${col} LIKE ?`;
      case "startsWith":
        params.push(`${c.value ?? ""}%`);
        return `${col} LIKE ?`;
      case "endsWith":
        params.push(`%${c.value ?? ""}`);
        return `${col} LIKE ?`;
      case "in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const qs = list.map(() => "?");
        params.push(...list);
        return `${col} IN (${qs.join(", ")})`;
      }
      case "not in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const qs = list.map(() => "?");
        params.push(...list);
        return `${col} NOT IN (${qs.join(", ")})`;
      }
      default:
        params.push(c.value ?? null);
        return `${col} ${c.operator} ?`;
    }
  });
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

// Firebird: identificador sin comillas (legado). Columnas creadas con comillas en Firebird tienen casing exacto; usar firebirdQuotedIdent.
function firebirdUnquotedIdent(name: string): string {
  let s = (name || "").trim();
  s = s.replace(/^primary\./i, "").replace(/^join_\d+\./i, "").trim();
  s = s.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
  return s || "COL";
}

/** Firebird: identificador entre comillas dobles para preservar mayúsculas/minúsculas (evita -206 Column unknown).
 * El nombre se preserva exactamente como llega; debe coincidir con el que devuelve la metadata (RDB$FIELD_NAME). */
function firebirdQuotedIdent(name: string): string {
  let s = (name || "").trim();
  s = s.replace(/^primary\./i, "").replace(/^join_\d+\./i, "").trim();
  if (!s) return '"COL"';
  return `"${s.replace(/"/g, '""')}"`;
}

// WHERE clause for Firebird (positional ? params). Usa identificadores entre comillas para coincidir con el casing de la base (evita -206).
export function buildWhereClauseFirebird(conds: FilterCondition[] = []) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    const col = firebirdQuotedIdent(c.column || "");
    switch (c.operator) {
      case "is null":
        return `${col} IS NULL`;
      case "is not null":
        return `${col} IS NOT NULL`;
      case "contains":
        params.push(`%${c.value ?? ""}%`);
        return `${col} CONTAINING ?`;
      case "startsWith":
        params.push(`${c.value ?? ""}%`);
        return `${col} LIKE ?`;
      case "endsWith":
        params.push(`%${c.value ?? ""}`);
        return `${col} LIKE ?`;
      case "in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const qs = list.map(() => "?");
        params.push(...list);
        return `${col} IN (${qs.join(", ")})`;
      }
      case "not in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const qs = list.map(() => "?");
        params.push(...list);
        return `${col} NOT IN (${qs.join(", ")})`;
      }
      default:
        params.push(c.value ?? null);
        return `${col} ${c.operator} ?`;
    }
  });
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

// Star schema WHERE (primary./join_i.) for Postgres
export function buildWhereClausePgStar(
  conds: FilterCondition[] = [],
  joinsCount: number,
  strictPrefixed = false
) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    const raw = c.column || "";
    const mPrimary = raw.match(/^primary\.(.+)$/i);
    const mJoin = raw.match(/^join_(\d+)\.(.+)$/i);
    let col: string;
    if (mPrimary) col = `p.${quoteIdent(mPrimary[1], "postgres")}`;
    else if (mJoin) {
      const idx = Number(mJoin[1]);
      const name = mJoin[2];
      if (!Number.isNaN(idx) && idx >= 0 && idx < joinsCount)
        col = `j${idx}.${quoteIdent(name, "postgres")}`;
      else col = quoteIdent(raw, "postgres");
    } else {
      if (strictPrefixed) {
        throw new Error(
          `Filtro '${raw}' sin prefijo en JOIN. Use primary.<col> o join_n.<col>.`
        );
      }
      col = quoteIdent(raw, "postgres");
    }
    switch (c.operator) {
      case "is null":
        return `${col} IS NULL`;
      case "is not null":
        return `${col} IS NOT NULL`;
      case "contains":
        params.push(`%${c.value ?? ""}%`);
        return `${col} ILIKE $${params.length}`;
      case "startsWith":
        params.push(`${c.value ?? ""}%`);
        return `${col} ILIKE $${params.length}`;
      case "endsWith":
        params.push(`%${c.value ?? ""}`);
        return `${col} ILIKE $${params.length}`;
      case "in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const idxs = list.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${col} IN (${idxs.join(", ")})`;
      }
      case "not in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const idxs = list.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${col} NOT IN (${idxs.join(", ")})`;
      }
      default:
        params.push(c.value ?? null);
        return `${col} ${c.operator} $${params.length}`;
    }
  });
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

// Star schema WHERE for MySQL
export function buildWhereClauseMyStar(
  conds: FilterCondition[] = [],
  joinsCount: number,
  strictPrefixed = false
) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    const raw = c.column || "";
    const mPrimary = raw.match(/^primary\.(.+)$/i);
    const mJoin = raw.match(/^join_(\d+)\.(.+)$/i);
    let col: string;
    if (mPrimary) col = `p.${quoteIdent(mPrimary[1], "mysql")}`;
    else if (mJoin) {
      const idx = Number(mJoin[1]);
      const name = mJoin[2];
      if (!Number.isNaN(idx) && idx >= 0 && idx < joinsCount)
        col = `j${idx}.${quoteIdent(name, "mysql")}`;
      else col = quoteIdent(raw, "mysql");
    } else {
      if (strictPrefixed) {
        throw new Error(
          `Filtro '${raw}' sin prefijo en JOIN. Use primary.<col> o join_n.<col>.`
        );
      }
      col = quoteIdent(raw, "mysql");
    }
    switch (c.operator) {
      case "is null":
        return `${col} IS NULL`;
      case "is not null":
        return `${col} IS NOT NULL`;
      case "contains":
        params.push(`%${c.value ?? ""}%`);
        return `${col} LIKE ?`;
      case "startsWith":
        params.push(`${c.value ?? ""}%`);
        return `${col} LIKE ?`;
      case "endsWith":
        params.push(`%${c.value ?? ""}`);
        return `${col} LIKE ?`;
      case "in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const qs = list.map(() => "?");
        params.push(...list);
        return `${col} IN (${qs.join(", ")})`;
      }
      case "not in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const qs = list.map(() => "?");
        params.push(...list);
        return `${col} NOT IN (${qs.join(", ")})`;
      }
      default:
        params.push(c.value ?? null);
        return `${col} ${c.operator} ?`;
    }
  });
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}
