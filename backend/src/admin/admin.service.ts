import {
  ForbiddenException,
  Injectable,
  ConflictException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  private assertAdmin(appRole?: string) {
    if (appRole !== "APP_ADMIN") {
      throw new ForbiddenException("Solo administradores");
    }
  }

  async listClients(appRole?: string) {
    this.assertAdmin(appRole);
    return this.db.query(`SELECT * FROM public.clients ORDER BY created_at DESC`);
  }

  async createClient(
    appRole: string | undefined,
    payload: {
      name: string;
      type?: string;
      adminEmail: string;
      adminPassword: string;
      adminName?: string;
    }
  ) {
    this.assertAdmin(appRole);
    const client = await this.db.queryOne<{ id: string }>(
      `INSERT INTO public.clients (name, type)
       VALUES ($1, COALESCE($2::public.client_type, 'empresa'))
       RETURNING id`,
      [payload.name, payload.type ?? "empresa"]
    );
    if (!client) throw new ConflictException("No se pudo crear el cliente");

    const existing = await this.db.queryOne<{ id: string }>(
      `SELECT id FROM public.profiles WHERE lower(email) = lower($1)`,
      [payload.adminEmail]
    );

    let userId = existing?.id;
    if (!userId) {
      userId = crypto.randomUUID();
      const hash = await bcrypt.hash(payload.adminPassword, 12);
      await this.db.query(
        `INSERT INTO public.profiles (id, email, full_name, password_hash, app_role)
         VALUES ($1, $2, $3, $4, 'CREATOR')`,
        [userId, payload.adminEmail, payload.adminName ?? null, hash]
      );
    }

    await this.db.query(
      `INSERT INTO public.client_members (client_id, user_id, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (client_id, user_id) DO NOTHING`,
      [client.id, userId]
    );

    return { clientId: client.id, userId };
  }

  async addClientMember(
    appRole: string | undefined,
    payload: {
      clientId: string;
      email: string;
      password?: string;
      fullName?: string;
      role?: string;
    }
  ) {
    this.assertAdmin(appRole);
    let user = await this.db.queryOne<{ id: string }>(
      `SELECT id FROM public.profiles WHERE lower(email) = lower($1)`,
      [payload.email]
    );
    if (!user) {
      const id = crypto.randomUUID();
      const hash = payload.password
        ? await bcrypt.hash(payload.password, 12)
        : null;
      user = await this.db.queryOne<{ id: string }>(
        `INSERT INTO public.profiles (id, email, full_name, password_hash, app_role)
         VALUES ($1, $2, $3, $4, 'VIEWER')
         RETURNING id`,
        [id, payload.email, payload.fullName ?? null, hash]
      );
    }
    if (!user) throw new ConflictException("No se pudo crear el usuario");

    await this.db.query(
      `INSERT INTO public.client_members (client_id, user_id, role)
       VALUES ($1, $2, COALESCE($3::public.client_role, 'viewer'))
       ON CONFLICT (client_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [payload.clientId, user.id, payload.role ?? "viewer"]
    );
    return { userId: user.id };
  }

  async listUsers(appRole?: string) {
    this.assertAdmin(appRole);
    return this.db.query(
      `SELECT id, email, full_name, avatar_url, app_role, created_at
       FROM public.profiles ORDER BY created_at DESC`
    );
  }
}
