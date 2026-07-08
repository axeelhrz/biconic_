import {
  Body,
  Controller,
  HttpException,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @UseGuards(JwtAuthGuard)
  @Post("aggregate-data")
  async aggregateData(
    @Body() body: Record<string, unknown>,
    @Req() req: Request & { user: { sub: string } }
  ) {
    const result = await this.dashboard.aggregateData(body, req.user.sub);
    if (result.status >= 400) {
      throw new HttpException(result.data as string | Record<string, unknown>, result.status);
    }
    return result.data;
  }

  @UseGuards(JwtAuthGuard)
  @Post("distinct-values")
  async distinctValues(
    @Body()
    body: { tableName: string; field: string; limit?: number; transform?: string },
    @Req() req: Request & { user: { sub: string } }
  ) {
    const result = await this.dashboard.distinctValues(body, req.user.sub);
    if (result.status >= 400) {
      throw new HttpException(result.data as string | Record<string, unknown>, result.status);
    }
    return result.data;
  }

  @UseGuards(JwtAuthGuard)
  @Post("raw-data")
  async rawData(
    @Body() body: { tableName: string; limit?: number; offset?: number },
    @Req() req: Request & { user: { sub: string } }
  ) {
    const result = await this.dashboard.rawData(body);
    return result.data;
  }
}
