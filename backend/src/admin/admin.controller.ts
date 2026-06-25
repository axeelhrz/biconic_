import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("clients")
  listClients(@Req() req: Request & { user: { app_role?: string } }) {
    return this.admin.listClients(req.user.app_role);
  }

  @Post("clients")
  createClient(
    @Body()
    body: {
      name: string;
      type?: string;
      adminEmail: string;
      adminPassword: string;
      adminName?: string;
    },
    @Req() req: Request & { user: { app_role?: string } }
  ) {
    return this.admin.createClient(req.user.app_role, body);
  }

  @Post("members")
  addMember(
    @Body()
    body: {
      clientId: string;
      email: string;
      password?: string;
      fullName?: string;
      role?: string;
    },
    @Req() req: Request & { user: { app_role?: string } }
  ) {
    return this.admin.addClientMember(req.user.app_role, body);
  }

  @Get("users")
  listUsers(@Req() req: Request & { user: { app_role?: string } }) {
    return this.admin.listUsers(req.user.app_role);
  }
}
