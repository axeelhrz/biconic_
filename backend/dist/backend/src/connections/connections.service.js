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
exports.ConnectionsService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
let ConnectionsService = class ConnectionsService {
    constructor(db) {
        this.db = db;
    }
    async listForUser(userId, appRole) {
        if (appRole === "APP_ADMIN") {
            return this.db.query(`SELECT c.* FROM public.connections c ORDER BY c.created_at DESC`);
        }
        return this.db.query(`SELECT DISTINCT c.*
       FROM public.connections c
       JOIN public.client_members cm ON cm.client_id = c.client_id
       WHERE cm.user_id = $1
       ORDER BY c.created_at DESC`, [userId]);
    }
    async getById(id, userId, appRole) {
        const row = await this.db.queryOne(`SELECT * FROM public.connections WHERE id = $1`, [id]);
        if (!row)
            throw new common_1.NotFoundException("Conexión no encontrada");
        if (appRole !== "APP_ADMIN") {
            const allowed = await this.db.queryOne(`SELECT 1 FROM public.client_members cm
         JOIN public.connections c ON c.client_id = cm.client_id
         WHERE c.id = $1 AND cm.user_id = $2`, [id, userId]);
            if (!allowed)
                throw new common_1.ForbiddenException("Sin permiso");
        }
        return row;
    }
    async create(userId, payload) {
        return this.db.queryOne(`INSERT INTO public.connections (name, type, user_id, client_id, config)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`, [
            payload.name,
            payload.type,
            userId,
            payload.clientId ?? null,
            JSON.stringify(payload.config ?? {}),
        ]);
    }
    async update(id, payload, userId, appRole) {
        await this.getById(id, userId, appRole);
        const allowed = new Set(["client_id", "name", "config"]);
        const keys = Object.keys(payload).filter((k) => allowed.has(k));
        if (!keys.length)
            return { error: "Sin campos válidos" };
        const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
        const vals = [id, ...keys.map((k) => payload[k])];
        return this.db.queryOne(`UPDATE public.connections SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`, vals);
    }
    async executeQuery(connectionId, sql, userId, appRole) {
        await this.getById(connectionId, userId, appRole);
        if (!/^\s*(SELECT|WITH)\s/i.test(sql)) {
            throw new common_1.ForbiddenException("Solo SELECT permitido");
        }
        return this.db.executeSql(sql);
    }
};
exports.ConnectionsService = ConnectionsService;
exports.ConnectionsService = ConnectionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], ConnectionsService);
//# sourceMappingURL=connections.service.js.map