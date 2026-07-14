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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = __importStar(require("bcryptjs"));
const database_service_1 = require("../database/database.service");
let AdminService = class AdminService {
    constructor(db) {
        this.db = db;
    }
    assertAdmin(appRole) {
        if (appRole !== "APP_ADMIN") {
            throw new common_1.ForbiddenException("Solo administradores");
        }
    }
    async listClients(appRole) {
        this.assertAdmin(appRole);
        return this.db.query(`SELECT * FROM public.clients ORDER BY created_at DESC`);
    }
    async createClient(appRole, payload) {
        this.assertAdmin(appRole);
        const client = await this.db.queryOne(`INSERT INTO public.clients (name, type)
       VALUES ($1, COALESCE($2::public.client_type, 'empresa'))
       RETURNING id`, [payload.name, payload.type ?? "empresa"]);
        if (!client)
            throw new common_1.ConflictException("No se pudo crear el cliente");
        const existing = await this.db.queryOne(`SELECT id FROM public.profiles WHERE lower(email) = lower($1)`, [payload.adminEmail]);
        let userId = existing?.id;
        if (!userId) {
            userId = crypto.randomUUID();
            const hash = await bcrypt.hash(payload.adminPassword, 12);
            await this.db.query(`INSERT INTO public.profiles (id, email, full_name, password_hash, app_role)
         VALUES ($1, $2, $3, $4, 'CREATOR')`, [userId, payload.adminEmail, payload.adminName ?? null, hash]);
        }
        await this.db.query(`INSERT INTO public.client_members (client_id, user_id, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (client_id, user_id) DO NOTHING`, [client.id, userId]);
        return { clientId: client.id, userId };
    }
    async addClientMember(appRole, payload) {
        this.assertAdmin(appRole);
        let user = await this.db.queryOne(`SELECT id FROM public.profiles WHERE lower(email) = lower($1)`, [payload.email]);
        if (!user) {
            const id = crypto.randomUUID();
            const hash = payload.password
                ? await bcrypt.hash(payload.password, 12)
                : null;
            user = await this.db.queryOne(`INSERT INTO public.profiles (id, email, full_name, password_hash, app_role)
         VALUES ($1, $2, $3, $4, 'VIEWER')
         RETURNING id`, [id, payload.email, payload.fullName ?? null, hash]);
        }
        if (!user)
            throw new common_1.ConflictException("No se pudo crear el usuario");
        await this.db.query(`INSERT INTO public.client_members (client_id, user_id, role)
       VALUES ($1, $2, COALESCE($3::public.client_role, 'viewer'))
       ON CONFLICT (client_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [payload.clientId, user.id, payload.role ?? "viewer"]);
        return { userId: user.id };
    }
    async listUsers(appRole) {
        this.assertAdmin(appRole);
        return this.db.query(`SELECT id, email, full_name, avatar_url, app_role, created_at
       FROM public.profiles ORDER BY created_at DESC`);
    }
    async createUser(appRole, payload) {
        this.assertAdmin(appRole);
        const email = payload.email.trim().toLowerCase();
        const existing = await this.db.queryOne(`SELECT id FROM public.profiles WHERE lower(email) = lower($1)`, [email]);
        if (existing) {
            throw new common_1.ConflictException("El email ya está registrado");
        }
        const id = crypto.randomUUID();
        const hash = await bcrypt.hash(payload.password, 12);
        const role = payload.appRole ?? "VIEWER";
        const user = await this.db.queryOne(`INSERT INTO public.profiles (id, email, full_name, password_hash, app_role)
       VALUES ($1, $2, $3, $4, $5::public.app_role)
       RETURNING id`, [id, email, payload.fullName ?? null, hash, role]);
        if (!user)
            throw new common_1.ConflictException("No se pudo crear el usuario");
        return { userId: user.id };
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], AdminService);
//# sourceMappingURL=admin.service.js.map