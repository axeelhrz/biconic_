"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresServiceQuery = void 0;
exports.getServiceDbUrl = getServiceDbUrl;
exports.createServiceAdminClient = createServiceAdminClient;
exports.createServiceRoleOrAdminClient = createServiceRoleOrAdminClient;
const postgres_1 = __importDefault(require("postgres"));
const internal_db_url_1 = require("../db/internal-db-url");
function getServiceDbUrl() {
    return (0, internal_db_url_1.getInternalDbUrl)();
}
function toSqlParams(vals) {
    return vals;
}
function parseOrFilter(filter) {
    const parts = filter.split(",").map((p) => p.trim()).filter(Boolean);
    const clauses = parts.map((part) => {
        if (part.endsWith(".is.null")) {
            const col = part.replace(/\.is\.null$/, "");
            return `"${col}" IS NULL`;
        }
        const dot = part.indexOf(".");
        const col = part.slice(0, dot);
        const rest = part.slice(dot + 1);
        const opDot = rest.indexOf(".");
        const op = opDot >= 0 ? rest.slice(0, opDot) : rest;
        const rawVal = opDot >= 0 ? rest.slice(opDot + 1) : "";
        if (op === "eq") {
            if (rawVal === "true")
                return `"${col}" = true`;
            if (rawVal === "false")
                return `"${col}" = false`;
            if (rawVal === "null")
                return `"${col}" IS NULL`;
            return `"${col}" = '${rawVal.replace(/'/g, "''")}'`;
        }
        if (op === "ilike") {
            return `"${col}" ILIKE '${rawVal.replace(/'/g, "''")}'`;
        }
        return "TRUE";
    });
    return `(${clauses.join(" OR ")})`;
}
class PostgresServiceQuery {
    constructor(sql, table, schema = "public") {
        this.sql = sql;
        this.table = table;
        this.schema = schema;
        this.filters = [];
        this.orClause = null;
        this.selectCols = "*";
        this.isUpdate = false;
        this.isInsert = false;
        this.isUpsert = false;
        this.isDelete = false;
        this.updatePayload = {};
        this.insertPayload = {};
        this.insertReturning = "*";
        this.wantSingle = false;
        this.wantThrow = false;
        this.orderAsc = true;
        this.nullsFirst = false;
        this.countHead = false;
    }
    qualifiedTable() {
        return `"${this.schema}"."${this.table}"`;
    }
    select(cols = "*", opts) {
        if (opts?.count === "exact" && opts?.head) {
            this.countHead = true;
            return this;
        }
        if (this.isInsert) {
            this.insertReturning = cols;
            return this;
        }
        this.selectCols =
            cols.includes("(") || cols.includes(":") || cols.includes("\n") ? "*" : cols;
        return this;
    }
    insert(payload) {
        this.isInsert = true;
        this.insertPayload = payload;
        return this;
    }
    upsert(payload, opts) {
        this.isUpsert = true;
        this.insertPayload = payload;
        this.upsertConflictCol = opts?.onConflict;
        return this;
    }
    update(payload) {
        this.isUpdate = true;
        this.updatePayload = payload;
        return this;
    }
    eq(col, val) {
        this.filters.push({ col, val, op: "eq" });
        return this;
    }
    ilike(col, val) {
        this.filters.push({ col, val, op: "ilike" });
        return this;
    }
    in(col, val) {
        this.filters.push({ col, val, op: "in" });
        return this;
    }
    lt(col, val) {
        this.filters.push({ col, val, op: "lt" });
        return this;
    }
    gt(col, val) {
        this.filters.push({ col, val, op: "gt" });
        return this;
    }
    gte(col, val) {
        this.filters.push({ col, val, op: "gte" });
        return this;
    }
    or(filter) {
        this.orClause = filter;
        return this;
    }
    neq(col, val) {
        this.filters.push({ col, val, op: "neq" });
        return this;
    }
    is(col, val) {
        this.filters.push({ col, val, op: "is" });
        return this;
    }
    order(col, opts) {
        if (col) {
            this.orderCol = col;
            this.orderAsc = opts?.ascending !== false;
            this.nullsFirst = opts?.nullsFirst === true;
        }
        return this;
    }
    limit(n) {
        this.limitN = n;
        return this;
    }
    range(from, to) {
        this.offsetN = from;
        this.limitN = to - from + 1;
        return this;
    }
    delete() {
        this.isDelete = true;
        return this;
    }
    single() {
        this.wantSingle = true;
        return this;
    }
    maybeSingle() {
        this.wantSingle = true;
        return this;
    }
    throwOnError() {
        this.wantThrow = true;
        return this;
    }
    then(onfulfilled, onrejected) {
        return this.execute().then(onfulfilled, onrejected);
    }
    buildWhere(vals) {
        const clauses = [];
        if (this.orClause) {
            clauses.push(parseOrFilter(this.orClause));
        }
        for (const f of this.filters) {
            vals.push(f.val);
            const idx = vals.length;
            const col = `"${f.col}"`;
            if (f.op === "in" && Array.isArray(f.val)) {
                clauses.push(`${col} = ANY($${idx})`);
            }
            else if (f.op === "ilike") {
                clauses.push(`${col} ILIKE $${idx}`);
            }
            else if (f.op === "neq") {
                clauses.push(`${col} <> $${idx}`);
            }
            else if (f.op === "is" && f.val === null) {
                clauses.push(`${col} IS NULL`);
                vals.pop();
            }
            else if (f.op === "lt") {
                clauses.push(`${col} < $${idx}`);
            }
            else if (f.op === "gt") {
                clauses.push(`${col} > $${idx}`);
            }
            else if (f.op === "gte") {
                clauses.push(`${col} >= $${idx}`);
            }
            else {
                clauses.push(`${col} = $${idx}`);
            }
        }
        if (!clauses.length)
            return "";
        return ` WHERE ${clauses.join(" AND ")}`;
    }
    async execute() {
        try {
            if (this.isInsert || this.isUpsert) {
                const row = Array.isArray(this.insertPayload)
                    ? this.insertPayload[0]
                    : this.insertPayload;
                const keys = Object.keys(row ?? {});
                if (!keys.length)
                    return { data: null, error: { message: "Insert vacío" } };
                const vals = keys.map((k) => row[k]);
                const cols = keys.map((k) => `"${k}"`).join(", ");
                const ph = keys.map((_, i) => `$${i + 1}`).join(", ");
                const returning = this.insertReturning === "*" ? "*" : this.insertReturning;
                let query = `INSERT INTO ${this.qualifiedTable()} (${cols}) VALUES (${ph})`;
                if (this.isUpsert && this.upsertConflictCol) {
                    const conflictCol = this.upsertConflictCol;
                    const updates = keys
                        .filter((k) => k !== conflictCol)
                        .map((k) => `"${k}" = EXCLUDED."${k}"`)
                        .join(", ");
                    if (updates) {
                        query += ` ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updates}`;
                    }
                    else {
                        query += ` ON CONFLICT ("${conflictCol}") DO NOTHING`;
                    }
                }
                query += ` RETURNING ${returning}`;
                const rows = await this.sql.unsafe(query, toSqlParams(vals));
                const data = this.wantSingle ? rows[0] ?? null : rows;
                if (this.wantThrow && !data) {
                    throw new Error(`No se pudo insertar en ${this.table}`);
                }
                return { data, error: null };
            }
            if (this.isUpdate) {
                const sets = Object.keys(this.updatePayload);
                if (!sets.length)
                    return { data: null, error: null };
                const vals = [...sets.map((k) => this.updatePayload[k])];
                const assignments = sets
                    .map((k, i) => `"${k}" = $${i + 1}`)
                    .join(", ");
                let query = `UPDATE ${this.qualifiedTable()} SET ${assignments}`;
                if (this.table === "data_tables" && !sets.includes("updated_at")) {
                    query += `, updated_at = now()`;
                }
                query += this.buildWhere(vals);
                query += " RETURNING *";
                const rows = await this.sql.unsafe(query, toSqlParams(vals));
                const data = this.wantSingle ? rows[0] ?? null : rows;
                return { data, error: null };
            }
            if (this.isDelete) {
                const vals = [];
                let query = `DELETE FROM ${this.qualifiedTable()}`;
                query += this.buildWhere(vals);
                await this.sql.unsafe(query, toSqlParams(vals));
                return { data: null, error: null };
            }
            if (this.countHead) {
                const vals = [];
                let query = `SELECT count(*)::int AS count FROM ${this.qualifiedTable()}`;
                query += this.buildWhere(vals);
                const rows = await this.sql.unsafe(query, toSqlParams(vals));
                const count = Number(rows[0]?.count ?? 0);
                return { data: null, count, error: null };
            }
            const vals = [];
            let query = `SELECT ${this.selectCols} FROM ${this.qualifiedTable()}`;
            query += this.buildWhere(vals);
            if (this.orderCol) {
                const nulls = this.nullsFirst ? " NULLS FIRST" : "";
                query += ` ORDER BY "${this.orderCol}" ${this.orderAsc ? "ASC" : "DESC"}${nulls}`;
            }
            if (this.limitN != null)
                query += ` LIMIT ${this.limitN}`;
            if (this.offsetN != null)
                query += ` OFFSET ${this.offsetN}`;
            const rows = await this.sql.unsafe(query, toSqlParams(vals));
            const data = this.wantSingle ? rows[0] ?? null : rows;
            if (this.wantThrow && !data) {
                throw new Error(`No se encontró fila en ${this.table}`);
            }
            return { data, error: null };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (this.wantThrow) {
                throw err instanceof Error ? err : new Error(message);
            }
            return { data: null, error: { message } };
        }
    }
}
exports.PostgresServiceQuery = PostgresServiceQuery;
let sharedSql = null;
function getSharedSql() {
    if (!sharedSql) {
        sharedSql = (0, postgres_1.default)(getServiceDbUrl(), { max: 3, idle_timeout: 30 });
    }
    return sharedSql;
}
function createServiceAdminClient() {
    const sql = getSharedSql();
    return {
        from(table) {
            return new PostgresServiceQuery(sql, table, "public");
        },
        schema(schemaName) {
            return {
                from(table) {
                    return new PostgresServiceQuery(sql, table, schemaName);
                },
            };
        },
        _sql: sql,
    };
}
function createServiceRoleOrAdminClient() {
    return createServiceAdminClient();
}
//# sourceMappingURL=service-admin-client.js.map