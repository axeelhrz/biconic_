"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAggregateDataDeps = createAggregateDataDeps;
exports.createPgAggregateDataDeps = createPgAggregateDataDeps;
const service_1 = require("../supabase/service");
const postgres_1 = __importDefault(require("postgres"));
const internal_db_url_1 = require("../db/internal-db-url");
function toSqlParams(vals) {
    return vals;
}
function createAggregateDataDeps(options) {
    const databaseUrl = options.databaseUrl ?? (0, internal_db_url_1.getInternalDbUrl)();
    return createPgAggregateDataDeps({
        userId: options.userId,
        requireAuth: options.requireAuth,
        databaseUrl,
        geoCacheClient: options.geoCacheClient ??
            (0, service_1.createServiceRoleClient)(),
    });
}
function createPgAggregateDataDeps(options) {
    const sql = (0, postgres_1.default)(options.databaseUrl);
    async function executeSql(query) {
        try {
            const rows = (await sql.unsafe(query));
            return { data: rows, error: null };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { data: null, error: { message } };
        }
    }
    return {
        databaseUrl: options.databaseUrl,
        userId: options.userId,
        requireAuth: options.requireAuth,
        geoCacheClient: options.geoCacheClient ?? null,
        executeSql,
        async findEtlIdByOutputTable(table) {
            const rows = await sql.unsafe(`SELECT id FROM public.etl WHERE output_table ILIKE $1 LIMIT 1`, toSqlParams([table]));
            return rows[0]?.id ?? null;
        },
        async findEtlIdByRunDestination(table) {
            const rows = await sql.unsafe(`SELECT etl_id FROM public.etl_runs_log
         WHERE status = 'completed' AND destination_table_name ILIKE $1
         ORDER BY completed_at DESC LIMIT 1`, toSqlParams([table]));
            return rows[0]?.etl_id ?? null;
        },
        async getEtlLayout(etlId) {
            const rows = await sql.unsafe(`SELECT layout FROM public.etl WHERE id = $1 LIMIT 1`, toSqlParams([etlId]));
            return rows[0]?.layout ?? null;
        },
    };
}
//# sourceMappingURL=createAggregateDataDeps.js.map