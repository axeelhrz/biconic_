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
  tablePrefix: string = ""
): { clause: string; params: any[] } {
  const params: any[] = [];
  const parts: string[] = [];
  if (!dateFilter?.column) return { clause: "", params };

  const col = tablePrefix + quoteIdent(dateFilter.column, "postgres");
  const dateExpr = `(
    CASE
      WHEN ${col}::text ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(${col}::text, 'DD/MM/YYYY')
      WHEN ${col}::text LIKE '%, % de % de %' THEN to_date(${col}::text, 'Day, DD "de" Month "de" YYYY')
      ELSE ${col}::date
    END
  )`;

  let idx = paramStartIndex;
  if (dateFilter.years?.length) {
    const placeholders = dateFilter.years.map(() => `$${idx++}`);
    dateFilter.years.forEach((y) => params.push(y));
    parts.push(`EXTRACT(YEAR FROM ${dateExpr}) IN (${placeholders.join(", ")})`);
  }
  if (dateFilter.months?.length) {
    const placeholders = dateFilter.months.map(() => `$${idx++}`);
    dateFilter.months.forEach((m) => params.push(m));
    parts.push(`EXTRACT(MONTH FROM ${dateExpr}) IN (${placeholders.join(", ")})`);
  }
  if (dateFilter.exactDates?.length) {
    const valid = dateFilter.exactDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (valid.length) {
      valid.forEach((d) => params.push(d));
      const placeholders = valid.map(() => `$${idx++}`);
      parts.push(`${dateExpr} IN (${placeholders.map((p) => `${p}::date`).join(", ")})`);
    }
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

// Firebird: identificador sin comillas para que el motor lo pase a mayúsculas y coincida con columnas creadas sin comillas (evita -206 Column unknown por diferencias de casing).
// Quita prefijos primary. / join_N. para que solo se use el nombre real de la columna en la tabla.
function firebirdUnquotedIdent(name: string): string {
  let s = (name || "").trim();
  s = s.replace(/^primary\./i, "").replace(/^join_\d+\./i, "").trim();
  s = s.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
  return s || "COL";
}

// WHERE clause for Firebird (positional ? params)
export function buildWhereClauseFirebird(conds: FilterCondition[] = []) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    const col = firebirdUnquotedIdent(c.column || "");
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
  joinsCount: number
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
    } else col = quoteIdent(raw, "postgres");
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
  joinsCount: number
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
    } else col = quoteIdent(raw, "mysql");
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
