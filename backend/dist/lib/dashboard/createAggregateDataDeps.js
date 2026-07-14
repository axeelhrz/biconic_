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
        async getDatasetById(datasetId) {
            const rows = await sql.unsafe(`SELECT id, etl_id, config FROM public.dataset WHERE id = $1 LIMIT 1`, toSqlParams([datasetId]));
            const row = rows[0];
            if (!row?.id)
                return null;
            return {
                id: String(row.id),
                etl_id: String(row.etl_id ?? ""),
                config: row.config && typeof row.config === "object"
                    ? row.config
                    : {},
            };
        },
        async getFirstDatasetIdForEtl(etlId) {
            const rows = await sql.unsafe(`SELECT id FROM public.dataset WHERE etl_id = $1 ORDER BY updated_at DESC LIMIT 1`, toSqlParams([etlId]));
            const id = rows[0]?.id;
            return id ? String(id) : null;
        },
        async resolveDatasetTable(etlId) {
            const runRows = await sql.unsafe(`SELECT destination_schema, destination_table_name FROM public.etl_runs_log
         WHERE etl_id = $1 AND status = 'completed'
         ORDER BY completed_at DESC LIMIT 1`, toSqlParams([etlId]));
            const run = runRows[0];
            if (run?.destination_table_name) {
                return {
                    schema: run.destination_schema || "etl_output",
                    tableName: run.destination_table_name,
                };
            }
            const etlRows = await sql.unsafe(`SELECT output_table FROM public.etl WHERE id = $1 LIMIT 1`, toSqlParams([etlId]));
            const outputTable = etlRows[0]?.output_table?.trim();
            if (outputTable) {
                return { schema: "etl_output", tableName: outputTable };
            }
            return null;
        },
    };
}
//# sourceMappingURL=createAggregateDataDeps.js.map