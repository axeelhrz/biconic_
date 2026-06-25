import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Sse,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { Observable, interval, map, switchMap, takeWhile } from "rxjs";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { EtlService } from "./etl.service";
import { DatabaseService } from "../database/database.service";

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

  @UseGuards(JwtAuthGuard)
  @Post("run")
  async run(
    @Body() body: { etlId: string } & Record<string, unknown>,
    @Req() req: Request & { user: { sub: string } }
  ) {
    return this.etl.enqueueRun({
      etlId: body.etlId,
      userId: req.user.sub,
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
  markStale(@Headers("authorization") auth?: string) {
    const secret = auth?.replace(/^Bearer\s+/i, "") ?? "";
    return this.etl.markStaleRunsFailed();
  }

  @Post("run-scheduled")
  runScheduled(@Headers("authorization") auth?: string) {
    const secret = auth?.replace(/^Bearer\s+/i, "") ?? "";
    return this.etl.runScheduled(secret);
  }
}
