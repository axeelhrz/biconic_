import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
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
