import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setAuthCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string }
  ) {
    const secure = process.env.NODE_ENV === "production";
    res.cookie("biconic_access", tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
      path: "/",
    });
    res.cookie("biconic_refresh", tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }

  @Post("login")
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.auth.login(body.email, body.password);
    this.setAuthCookies(res, result);
    return { user: result.user };
  }

  @Post("register")
  async register(
    @Body() body: { email: string; password: string; fullName?: string },
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.auth.register(body.email, body.password, body.fullName);
    this.setAuthCookies(res, result);
    return { user: result.user };
  }

  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken =
      req.cookies?.biconic_refresh ??
      (typeof req.body?.refreshToken === "string" ? req.body.refreshToken : undefined);
    if (!refreshToken) {
      return { error: "Refresh token requerido" };
    }
    const result = await this.auth.refresh(refreshToken);
    this.setAuthCookies(res, result);
    return { user: result.user };
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.biconic_refresh);
    res.clearCookie("biconic_access");
    res.clearCookie("biconic_refresh");
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req: Request & { user: { sub: string } }) {
    return this.auth.me(req.user.sub);
  }

  @Post("migrate-users")
  async migrateUsers(
    @Body()
    body: {
      secret: string;
      users: Array<{ id: string; email: string; full_name?: string; app_role?: string }>;
    }
  ) {
    const expected = process.env.MIGRATION_SECRET ?? process.env.JWT_SECRET;
    if (!expected || body.secret !== expected) {
      return { error: "No autorizado" };
    }
    return this.auth.migrateFromSupabaseExport(body.users);
  }
}
