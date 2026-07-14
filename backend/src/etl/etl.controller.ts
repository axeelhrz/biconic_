import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Sse,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { Observable, interval, map, switchMap, takeWhile } from "rxjs";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  isValidSchedulerSecret,
  JwtOrCronAuthGuard,
} from "../auth/jwt-or-cron.guard";
import { EtlService } from "./etl.service";
import { DatabaseService } from "../database/database.service";

function resolveCronSecret(
  authorization?: string,
  cronHeader?: string
): string {
  const fromAuth = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  const fromHeader = (cronHeader ?? "").trim();
  return fromHeader || fromAuth;
}

@Controller("etl")
export class EtlController {
  constructor(
    private readonly etl: EtlService,
    private readonly db: DatabaseService
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: Request & { user: { sub: string; app_role?: string } }) {
    return this.etl.listEtlsForUser(req.user.sub, req.user.app_role ?? "CREATOR");
  }

  @UseGuards(JwtOrCronAuthGuard)
  @Post("run")
  async run(
    @Body() body: { etlId: string; userId?: string } & Record<string, unknown>,
    @Req()
    req: Request & { user?: { sub: string }; cronAuth?: boolean },
    @Headers("authorization") authorization?: string,
    @Headers("x-cron-secret") cronHeader?: string
  ) {
    if (!body?.etlId) {
      throw new UnauthorizedException("etlId requerido");
    }

    const cronSecret = resolveCronSecret(authorization, cronHeader);
    if (req.cronAuth || isValidSchedulerSecret(cronSecret)) {
      let userId = typeof body.userId === "string" ? body.userId.trim() : "";
      if (!userId) {
        const row = await this.db.queryOne<{ user_id: string }>(
          `SELECT user_id FROM public.etl WHERE id = $1 LIMIT 1`,
          [body.etlId]
        );
        userId = row?.user_id ?? "";
      }
      if (!userId) {
        throw new UnauthorizedException("ETL sin usuario propietario");
      }
      return this.etl.enqueueRun({
        etlId: body.etlId,
        userId,
        body,
      });
    }

    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException("No autorizado");
    }
    return this.etl.enqueueRun({
      etlId: body.etlId,
      userId,
      body,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get("runs/:runId")
  getRun(@Param("runId") runId: string) {
    return this.etl.getRunStatus(runId);
  }

  @UseGuards(JwtAuthGuard)
  @Sse("runs/:runId/events")
  runEvents(@Param("runId") runId: string): Observable<{ data: unknown }> {
    return interval(2000).pipe(
      switchMap(async () => {
        const row = await this.etl.getRunStatus(runId);
        return row;
      }),
      takeWhile((row) => row?.status === "started" || row?.status === "running", true),
      map((row) => ({ data: row }))
    );
  }

  @Post("mark-stale-runs-failed")
  markStale(
    @Headers("authorization") auth?: string,
    @Headers("x-cron-secret") cronHeader?: string
  ) {
    const secret = resolveCronSecret(auth, cronHeader);
    if (!isValidSchedulerSecret(secret)) {
      throw new UnauthorizedException("Unauthorized");
    }
    return this.etl.markStaleRunsFailed();
  }

  @Post("run-scheduled")
  runScheduled(
    @Headers("authorization") auth?: string,
    @Headers("x-cron-secret") cronHeader?: string
  ) {
    const secret = resolveCronSecret(auth, cronHeader);
    return this.etl.runScheduled(secret);
  }
}
