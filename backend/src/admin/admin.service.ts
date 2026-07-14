import {
  ForbiddenException,
  Injectable,
  ConflictException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { DatabaseService } from "../database/database.service";

type CreateClientPayload = {
  name: string;
  type?: string;
  companyName?: string;
  individualFullName?: string;
  identificationType?: string;
  identificationNumber?: string;
  countryId?: string;
  provinceId?: string;
  capital?: string;
  address?: string;
  contactEmail?: string;
  status?: string;
  planId?: string;
  adminEmail: string;
  adminPassword: string;
  adminName?: string;
  adminRole?: string;
};

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  private assertAdmin(appRole?: string) {
    if (appRole !== "APP_ADMIN") {
      throw new ForbiddenException("Solo administradores");
    }
  }

  private async getClientColumns(): Promise<Set<string>> {
    const rows = await this.db.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'clients'`
    );
    return new Set(rows.map((r) => r.column_name));
  }

  private normalizeClientRole(role?: string): string {
    const r = (role ?? "admin").toLowerCase();
    if (r === "ver" || r === "viewer") return "viewer";
    if (r === "editar" || r === "editor") return "editor";
    if (r === "admin") return "admin";
    return "admin";
  }

  async listClients(appRole?: string) {
    this.assertAdmin(appRole);
    return this.db.query(`SELECT * FROM public.clients ORDER BY created_at DESC`);
  }

  async createClient(appRole: string | undefined, payload: CreateClientPayload) {
    this.assertAdmin(appRole);
    const cols = await this.getClientColumns();
    const clientType = payload.type ?? "empresa";
    const displayName =
      clientType === "empresa"
        ? payload.companyName?.trim() || payload.name?.trim() || "Cliente"
        : payload.individualFullName?.trim() || payload.name?.trim() || "Cliente";

    const fields: string[] = ["type"];
    const values: unknown[] = [clientType];
    const add = (col: string, val: unknown) => {
      if (!cols.has(col) || val == null || val === "") return;
      fields.push(col);
      values.push(val);
    };

    if (cols.has("company_name")) {
      if (clientType === "empresa" || !cols.has("individual_full_name")) {
        add("company_name", displayName);
      }
      if (clientType === "individuo" && cols.has("individual_full_name")) {
        add("individual_full_name", payload.individualFullName?.trim() || displayName);
      }
    } else if (cols.has("name")) {
      add("name", displayName);
    }

    add("identification_type", payload.identificationType?.trim());
    add("identification_number", payload.identificationNumber?.trim());
    add("country_id", payload.countryId?.trim());
    add("province_id", payload.provinceId?.trim());
    add("capital", payload.capital?.trim());
    add("address", payload.address?.trim());
    add("contact_email", payload.contactEmail?.trim());
    if (cols.has("status")) {
      add("status", payload.status === "inactivo" ? "Desactivado" : "Activo");
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
    const client = await this.db.queryOne<{ id: string }>(
      `INSERT INTO public.clients (${fields.join(", ")})
       VALUES (${placeholders})
       RETURNING id`,
      values
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

    const memberRole = this.normalizeClientRole(payload.adminRole);
    await this.db.query(
      `INSERT INTO public.client_members (client_id, user_id, role)
       VALUES ($1, $2, $3::public.client_role)
       ON CONFLICT (client_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [client.id, userId, memberRole]
    );

    const planId = payload.planId?.trim();
    if (planId) {
      const subStatus = payload.status === "inactivo" ? "canceled" : "active";
      await this.db.query(
        `INSERT INTO public.subscriptions (client_id, plan_id, status, billing_interval)
         VALUES ($1, $2, $3::public.subscription_status, 'month'::public.billing_interval)`,
        [client.id, planId, subStatus]
      );
    }

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

  async createUser(
    appRole: string | undefined,
    payload: {
      email: string;
      password: string;
      fullName?: string;
      appRole?: string;
    }
  ) {
    this.assertAdmin(appRole);
    const email = payload.email.trim().toLowerCase();
    const existing = await this.db.queryOne<{ id: string }>(
      `SELECT id FROM public.profiles WHERE lower(email) = lower($1)`,
      [email]
    );
    if (existing) {
      throw new ConflictException("El email ya está registrado");
    }

    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(payload.password, 12);
    const role = payload.appRole ?? "VIEWER";
    const user = await this.db.queryOne<{ id: string }>(
      `INSERT INTO public.profiles (id, email, full_name, password_hash, app_role)
       VALUES ($1, $2, $3, $4, $5::public.app_role)
       RETURNING id`,
      [id, email, payload.fullName ?? null, hash, role]
    );
    if (!user) throw new ConflictException("No se pudo crear el usuario");
    return { userId: user.id };
  }
}
