"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const internal_db_url_1 = require("../../../lib/db/internal-db-url");
let DashboardService = class DashboardService {
    constructor(db) {
        this.db = db;
    }
    buildGeoCacheClient() {
        const db = this.db;
        return {
            from(_table) {
                return {
                    select() {
                        return {
                            eq(_column, value) {
                                return {
                                    async maybeSingle() {
                                        try {
                                            const row = await db.queryOne(`SELECT cache_key, lat, lng FROM public.geo_location_cache WHERE cache_key = $1 LIMIT 1`, [value]);
                                            return { data: row, error: null };
                                        }
                                        catch (err) {
                                            return {
                                                data: null,
                                                error: { message: err instanceof Error ? err.message : String(err) },
                                            };
                                        }
                                    },
                                };
                            },
                        };
                    },
                    async upsert(payload) {
                        try {
                            await db.query(`INSERT INTO public.geo_location_cache (cache_key, lat, lng)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (cache_key) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng`, [payload.cache_key, payload.lat, payload.lng]);
                            return { error: null };
                        }
                        catch (err) {
                            return { error: { message: err instanceof Error ? err.message : String(err) } };
                        }
                    },
                };
            },
        };
    }
    async loadAggregateModules() {
        const handler = await Promise.resolve().then(() => __importStar(require("../../../lib/dashboard/aggregateDataHandler")));
        const depsFactory = await Promise.resolve().then(() => __importStar(require("../../../lib/dashboard/createAggregateDataDeps")));
        return {
            runAggregateData: handler.runAggregateData,
            createPgAggregateDataDeps: depsFactory.createPgAggregateDataDeps,
        };
    }
    async aggregateData(body, userId) {
        const { runAggregateData, createPgAggregateDataDeps } = await this.loadAggregateModules();
        const databaseUrl = (0, internal_db_url_1.getInternalDbUrl)();
        const deps = createPgAggregateDataDeps({
            userId: userId ?? null,
            requireAuth: true,
            databaseUrl,
        });
        deps.executeSql = (query) => this.db.executeSql(query);
        deps.geoCacheClient = this.buildGeoCacheClient();
        deps.findEtlIdByOutputTable = async (table) => {
            const row = await this.db.queryOne(`SELECT id FROM public.etl WHERE output_table ILIKE $1 LIMIT 1`, [table]);
            return row?.id ?? null;
        };
        deps.findEtlIdByRunDestination = async (table) => {
            const row = await this.db.queryOne(`SELECT etl_id FROM public.etl_runs_log
         WHERE status = 'completed' AND destination_table_name ILIKE $1
         ORDER BY completed_at DESC LIMIT 1`, [table]);
            return row?.etl_id ?? null;
        };
        deps.getEtlLayout = async (etlId) => {
            const row = await this.db.queryOne(`SELECT layout FROM public.etl WHERE id = $1 LIMIT 1`, [etlId]);
            return row?.layout ?? null;
        };
        return runAggregateData(body, deps);
    }
    async distinctValues(body, userId) {
        if (!userId)
            return { status: 401, data: { error: "No autenticado" } };
        const allowed = ["etl_output.", "public."];
        if (!allowed.some((p) => body.tableName?.startsWith(p))) {
            return { status: 400, data: { error: "Tabla no permitida" } };
        }
        const dot = body.tableName.indexOf(".");
        const schema = body.tableName.slice(0, dot);
        const table = body.tableName.slice(dot + 1);
        const field = body.field.replace(/[^a-zA-Z0-9_]/g, "");
        const limit = Math.min(body.limit ?? 500, 5000);
        const transformOp = String(body.transform ?? "").trim().toUpperCase();
        const quotedField = `"${field}"`;
        const dateExpr = `(
      CASE
        WHEN ${quotedField}::text ~ '^\\d{1,2}/\\d{1,2}/\\d{4}' THEN to_date(substring(${quotedField}::text from 1 for 10), 'DD/MM/YYYY')
        ELSE ${quotedField}::timestamp
      END
    )`;
        let selectExpression = quotedField;
        if (transformOp === "YEAR") {
            selectExpression = `EXTRACT(YEAR FROM ${dateExpr})::int::text`;
        }
        else if (transformOp === "MONTH") {
            selectExpression = `EXTRACT(MONTH FROM ${dateExpr})::int::text`;
        }
        else if (transformOp === "YEAR_MONTH") {
            selectExpression = `TO_CHAR(${dateExpr}, 'YYYY-MM')`;
        }
        else if (transformOp === "QUARTER") {
            selectExpression = `(EXTRACT(YEAR FROM ${dateExpr})::text || '-Q' || EXTRACT(QUARTER FROM ${dateExpr})::text)`;
        }
        else if (transformOp === "SEMESTER") {
            selectExpression = `(EXTRACT(YEAR FROM ${dateExpr})::text || '-S' || CASE WHEN EXTRACT(MONTH FROM ${dateExpr}) <= 6 THEN '1' ELSE '2' END)`;
        }
        else if (transformOp === "DAY") {
            selectExpression = `(${dateExpr})::date::text`;
        }
        const sql = `SELECT DISTINCT ${selectExpression} AS value
      FROM ${schema}."${table.replace(/"/g, "")}"
      WHERE ${quotedField} IS NOT NULL
        AND trim(${quotedField}::text) <> ''
      ORDER BY 1 LIMIT ${limit}`;
        const { data, error } = await this.db.executeSql(sql);
        if (error)
            return { status: 500, data: { error: error.message } };
        return {
            status: 200,
            data: (data ?? []).map((r) => r.value),
        };
    }
    async rawData(body) {
        const allowed = ["etl_output.", "public."];
        if (!allowed.some((p) => body.tableName?.startsWith(p))) {
            return { status: 400, data: { error: "Tabla no permitida" } };
        }
        const dot = body.tableName.indexOf(".");
        const schema = body.tableName.slice(0, dot);
        const table = body.tableName.slice(dot + 1);
        const limit = Math.min(body.limit ?? 100, 10_000);
        const offset = body.offset ?? 0;
        const sql = `SELECT * FROM ${schema}."${table.replace(/"/g, "")}"
      ORDER BY 1 LIMIT ${limit} OFFSET ${offset}`;
        const { data, error } = await this.db.executeSql(sql);
        if (error)
            return { status: 500, data: { error: error.message } };
        return { status: 200, data: data ?? [] };
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map