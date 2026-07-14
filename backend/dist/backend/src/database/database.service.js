"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const internal_db_url_1 = require("../../../lib/db/internal-db-url");
let DatabaseService = class DatabaseService {
    constructor() {
        const connectionString = (0, internal_db_url_1.getInternalDbUrl)();
        this.pool = new pg_1.Pool({
            connectionString,
            max: Number(process.env.DB_POOL_SIZE ?? 25),
            idleTimeoutMillis: 30_000,
        });
    }
    async query(text, params) {
        const result = await this.pool.query(text, params);
        return result.rows;
    }
    async queryOne(text, params) {
        const rows = await this.query(text, params);
        return rows[0] ?? null;
    }
    async executeSql(sqlQuery) {
        try {
            const rows = await this.query(`SELECT public.execute_sql($1) AS execute_sql`, [sqlQuery]);
            const payload = rows[0]?.execute_sql;
            if (Array.isArray(payload)) {
                return { data: payload, error: null };
            }
            return { data: payload ?? [], error: null };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { data: null, error: { message } };
        }
    }
    async onModuleDestroy() {
        await this.pool.end();
    }
};
exports.DatabaseService = DatabaseService;
exports.DatabaseService = DatabaseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], DatabaseService);
//# sourceMappingURL=database.service.js.map