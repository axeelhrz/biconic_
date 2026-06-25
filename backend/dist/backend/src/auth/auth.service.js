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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcryptjs"));
const crypto_1 = require("crypto");
const database_service_1 = require("../database/database.service");
let AuthService = class AuthService {
    constructor(db, jwt) {
        this.db = db;
        this.jwt = jwt;
    }
    refreshSecret() {
        return process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me";
    }
    signAccessToken(user) {
        return this.jwt.sign({
            sub: user.id,
            email: user.email,
            app_role: user.app_role,
        });
    }
    hashRefreshToken(token) {
        return (0, crypto_1.createHash)("sha256").update(token).digest("hex");
    }
    async issueRefreshToken(userId) {
        const raw = (0, crypto_1.randomBytes)(48).toString("hex");
        const tokenHash = this.hashRefreshToken(raw);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await this.db.query(`INSERT INTO public.refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [userId, tokenHash, expiresAt.toISOString()]);
        return raw;
    }
    async login(email, password) {
        const user = await this.db.queryOne(`SELECT id, email, full_name, avatar_url, app_role, password_hash
       FROM public.profiles WHERE lower(email) = lower($1) LIMIT 1`, [email]);
        if (!user?.password_hash) {
            throw new common_1.UnauthorizedException("Credenciales inválidas");
        }
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok)
            throw new common_1.UnauthorizedException("Credenciales inválidas");
        const accessToken = this.signAccessToken(user);
        const refreshToken = await this.issueRefreshToken(user.id);
        return {
            accessToken,
            refreshToken,
            user: this.publicUser(user),
        };
    }
    async register(email, password, fullName) {
        const existing = await this.db.queryOne(`SELECT id FROM public.profiles WHERE lower(email) = lower($1)`, [email]);
        if (existing)
            throw new common_1.ConflictException("El email ya está registrado");
        const passwordHash = await bcrypt.hash(password, 12);
        const id = crypto.randomUUID();
        const user = await this.db.queryOne(`INSERT INTO public.profiles (id, email, full_name, password_hash, app_role)
       VALUES ($1, $2, $3, $4, 'CREATOR')
       RETURNING id, email, full_name, avatar_url, app_role, password_hash`, [id, email, fullName ?? null, passwordHash]);
        if (!user)
            throw new common_1.ConflictException("No se pudo crear el usuario");
        const accessToken = this.signAccessToken(user);
        const refreshToken = await this.issueRefreshToken(user.id);
        return { accessToken, refreshToken, user: this.publicUser(user) };
    }
    async refresh(refreshToken) {
        const tokenHash = this.hashRefreshToken(refreshToken);
        const row = await this.db.queryOne(`SELECT user_id FROM public.refresh_tokens
       WHERE token_hash = $1 AND expires_at > now() LIMIT 1`, [tokenHash]);
        if (!row)
            throw new common_1.UnauthorizedException("Refresh token inválido");
        const user = await this.db.queryOne(`SELECT id, email, full_name, avatar_url, app_role, password_hash
       FROM public.profiles WHERE id = $1`, [row.user_id]);
        if (!user)
            throw new common_1.UnauthorizedException("Usuario no encontrado");
        await this.db.query(`DELETE FROM public.refresh_tokens WHERE token_hash = $1`, [
            tokenHash,
        ]);
        const accessToken = this.signAccessToken(user);
        const newRefresh = await this.issueRefreshToken(user.id);
        return { accessToken, refreshToken: newRefresh, user: this.publicUser(user) };
    }
    async logout(refreshToken) {
        if (!refreshToken)
            return { ok: true };
        const tokenHash = this.hashRefreshToken(refreshToken);
        await this.db.query(`DELETE FROM public.refresh_tokens WHERE token_hash = $1`, [
            tokenHash,
        ]);
        return { ok: true };
    }
    async me(userId) {
        const user = await this.db.queryOne(`SELECT id, email, full_name, avatar_url, app_role, password_hash
       FROM public.profiles WHERE id = $1`, [userId]);
        if (!user)
            throw new common_1.UnauthorizedException("Usuario no encontrado");
        return this.publicUser(user);
    }
    async migrateFromSupabaseExport(users) {
        let migrated = 0;
        for (const u of users) {
            await this.db.query(`INSERT INTO public.profiles (id, email, full_name, app_role)
         VALUES ($1, $2, $3, COALESCE($4::public.app_role, 'CREATOR'))
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name`, [u.id, u.email, u.full_name ?? null, u.app_role ?? "CREATOR"]);
            migrated++;
        }
        return { migrated };
    }
    publicUser(user) {
        return {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            app_role: user.app_role,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map