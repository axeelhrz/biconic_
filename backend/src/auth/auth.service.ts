import { Injectable, UnauthorizedException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { DatabaseService } from "../database/database.service";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  app_role: "APP_ADMIN" | "CREATOR" | "VIEWER";
  password_hash: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService
  ) {}

  private refreshSecret() {
    return process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me";
  }

  private signAccessToken(user: ProfileRow) {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      app_role: user.app_role,
    });
  }

  private hashRefreshToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private async issueRefreshToken(userId: string) {
    const raw = randomBytes(48).toString("hex");
    const tokenHash = this.hashRefreshToken(raw);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db.query(
      `INSERT INTO public.refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt.toISOString()]
    );
    return raw;
  }

  async login(email: string, password: string) {
    const user = await this.db.queryOne<ProfileRow>(
      `SELECT id, email, full_name, avatar_url, app_role, password_hash
       FROM public.profiles WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );
    if (!user?.password_hash) {
      throw new UnauthorizedException("Credenciales inválidas");
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new UnauthorizedException("Credenciales inválidas");

    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id);
    return {
      accessToken,
      refreshToken,
      user: this.publicUser(user),
    };
  }

  async register(email: string, password: string, fullName?: string) {
    const existing = await this.db.queryOne(
      `SELECT id FROM public.profiles WHERE lower(email) = lower($1)`,
      [email]
    );
    if (existing) throw new ConflictException("El email ya está registrado");

    const passwordHash = await bcrypt.hash(password, 12);
    const id = crypto.randomUUID();
    const user = await this.db.queryOne<ProfileRow>(
      `INSERT INTO public.profiles (id, email, full_name, password_hash, app_role)
       VALUES ($1, $2, $3, $4, 'CREATOR')
       RETURNING id, email, full_name, avatar_url, app_role, password_hash`,
      [id, email, fullName ?? null, passwordHash]
    );
    if (!user) throw new ConflictException("No se pudo crear el usuario");

    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken, user: this.publicUser(user) };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const row = await this.db.queryOne<{ user_id: string }>(
      `SELECT user_id FROM public.refresh_tokens
       WHERE token_hash = $1 AND expires_at > now() LIMIT 1`,
      [tokenHash]
    );
    if (!row) throw new UnauthorizedException("Refresh token inválido");

    const user = await this.db.queryOne<ProfileRow>(
      `SELECT id, email, full_name, avatar_url, app_role, password_hash
       FROM public.profiles WHERE id = $1`,
      [row.user_id]
    );
    if (!user) throw new UnauthorizedException("Usuario no encontrado");

    await this.db.query(`DELETE FROM public.refresh_tokens WHERE token_hash = $1`, [
      tokenHash,
    ]);
    const accessToken = this.signAccessToken(user);
    const newRefresh = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken: newRefresh, user: this.publicUser(user) };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { ok: true };
    const tokenHash = this.hashRefreshToken(refreshToken);
    await this.db.query(`DELETE FROM public.refresh_tokens WHERE token_hash = $1`, [
      tokenHash,
    ]);
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.db.queryOne<ProfileRow>(
      `SELECT id, email, full_name, avatar_url, app_role, password_hash
       FROM public.profiles WHERE id = $1`,
      [userId]
    );
    if (!user) throw new UnauthorizedException("Usuario no encontrado");
    return this.publicUser(user);
  }

  async migrateFromSupabaseExport(users: Array<{
    id: string;
    email: string;
    full_name?: string;
    app_role?: string;
  }>) {
    let migrated = 0;
    for (const u of users) {
      await this.db.query(
        `INSERT INTO public.profiles (id, email, full_name, app_role)
         VALUES ($1, $2, $3, COALESCE($4::public.app_role, 'CREATOR'))
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name`,
        [u.id, u.email, u.full_name ?? null, u.app_role ?? "CREATOR"]
      );
      migrated++;
    }
    return { migrated };
  }

  private publicUser(user: ProfileRow) {
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      app_role: user.app_role,
    };
  }
}
