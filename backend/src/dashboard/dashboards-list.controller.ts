import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DatabaseService } from "../database/database.service";

@Controller("dashboards")
@UseGuards(JwtAuthGuard)
export class DashboardsListController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async list(@Req() req: Request & { user: { sub: string; app_role?: string } }) {
    const userId = req.user.sub;
    const isAdmin = req.user.app_role === "APP_ADMIN";

    if (isAdmin) {
      return this.db.query(`SELECT * FROM public.dashboard ORDER BY created_at DESC`);
    }

    const owned = await this.db.query(
      `SELECT * FROM public.dashboard WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    const shared = await this.db.query(
      `SELECT d.* FROM public.dashboard d
       JOIN public.dashboard_has_client_permissions p ON p.dashboard_id = d.id
       JOIN public.client_members cm ON cm.id = p.client_member_id
       WHERE cm.user_id = $1`,
      [userId]
    );

    const byId = new Map<string, Record<string, unknown>>();
    for (const row of [...owned, ...shared]) {
      byId.set(String((row as { id: string }).id), row as Record<string, unknown>);
    }
    return Array.from(byId.values());
  }
}
