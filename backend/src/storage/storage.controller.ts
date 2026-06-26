import { Body, Controller, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { StorageService } from "./storage.service";

@Controller("storage")
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post("upload-url")
  uploadUrl(@Body() body: { key: string; contentType: string }) {
    return this.storage.getUploadUrl(body.key, body.contentType);
  }

  @Post("download-url")
  downloadUrl(@Body() body: { key: string }) {
    return this.storage.getDownloadUrl(body.key);
  }

  @Post("internal/download-url")
  internalDownloadUrl(
    @Body() body: { key: string },
    @Req() req: Request & { headers: Record<string, string | string[] | undefined> }
  ) {
    const secret =
      process.env.INTERNAL_PROCESS_EXCEL_SECRET?.trim() ??
      process.env.CRON_SECRET?.trim() ??
      "";
    const header = req.headers["x-internal-storage"];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!secret || provided !== secret) {
      throw new UnauthorizedException();
    }
    return this.storage.getDownloadUrl(body.key);
  }

  @Post("excel/process")
  processExcel(
    @Body() body: { connectionId: string; objectKey: string },
    @Req() req: Request & { user: { sub: string } }
  ) {
    return this.storage.enqueueExcelProcessing({
      connectionId: body.connectionId,
      objectKey: body.objectKey,
      userId: req.user.sub,
    });
  }
}
