import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ConnectionsService } from "./connections.service";

@Controller("connections")
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  list(@Req() req: Request & { user: { sub: string; app_role?: string } }) {
    return this.connections.listForUser(req.user.sub, req.user.app_role ?? "CREATOR");
  }

  @Get(":id")
  get(
    @Param("id") id: string,
    @Req() req: Request & { user: { sub: string; app_role?: string } }
  ) {
    return this.connections.getById(id, req.user.sub, req.user.app_role ?? "CREATOR");
  }

  @Post()
  create(
    @Body() body: { name: string; type: string; clientId?: string; config?: unknown },
    @Req() req: Request & { user: { sub: string } }
  ) {
    return this.connections.create(req.user.sub, body);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request & { user: { sub: string; app_role?: string } }
  ) {
    return this.connections.update(id, body, req.user.sub, req.user.app_role ?? "CREATOR");
  }

  @Post(":id/query")
  query(
    @Param("id") id: string,
    @Body() body: { sql: string },
    @Req() req: Request & { user: { sub: string; app_role?: string } }
  ) {
    return this.connections.executeQuery(
      id,
      body.sql,
      req.user.sub,
      req.user.app_role ?? "CREATOR"
    );
  }
}
