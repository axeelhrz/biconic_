import { Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class ConnectionsService {
  constructor(private readonly db: DatabaseService) {}

  async listForUser(userId: string, appRole: string) {
    if (appRole === "APP_ADMIN") {
      return this.db.query(
        `SELECT c.* FROM public.connections c ORDER BY c.created_at DESC`
      );
    }
    return this.db.query(
      `SELECT DISTINCT c.*
       FROM public.connections c
       JOIN public.client_members cm ON cm.client_id = c.client_id
       WHERE cm.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );
  }

  async getById(id: string, userId: string, appRole: string) {
    const row = await this.db.queryOne(
      `SELECT * FROM public.connections WHERE id = $1`,
      [id]
    );
    if (!row) throw new NotFoundException("Conexión no encontrada");
    if (appRole !== "APP_ADMIN") {
      const allowed = await this.db.queryOne(
        `SELECT 1 FROM public.client_members cm
         JOIN public.connections c ON c.client_id = cm.client_id
         WHERE c.id = $1 AND cm.user_id = $2`,
        [id, userId]
      );
      if (!allowed) throw new ForbiddenException("Sin permiso");
    }
    return row;
  }

  async create(
    userId: string,
    payload: { name: string; type: string; clientId?: string; config?: unknown }
  ) {
    return this.db.queryOne(
      `INSERT INTO public.connections (name, type, user_id, client_id, config)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [
        payload.name,
        payload.type,
        userId,
        payload.clientId ?? null,
        JSON.stringify(payload.config ?? {}),
      ]
    );
  }

  async update(
    id: string,
    payload: Record<string, unknown>,
    userId: string,
    appRole: string
  ) {
    await this.getById(id, userId, appRole);
    const allowed = new Set(["client_id", "name", "config"]);
    const keys = Object.keys(payload).filter((k) => allowed.has(k));
    if (!keys.length) return { error: "Sin campos válidos" };
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const vals = [id, ...keys.map((k) => payload[k])];
    return this.db.queryOne(
      `UPDATE public.connections SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`,
      vals
    );
  }

  async executeQuery(
    connectionId: string,
    sql: string,
    userId: string,
    appRole: string
  ) {
    await this.getById(connectionId, userId, appRole);
    if (!/^\s*(SELECT|WITH)\s/i.test(sql)) {
      throw new ForbiddenException("Solo SELECT permitido");
    }
    return this.db.executeSql(sql);
  }
}
