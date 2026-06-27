import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { StorageService } from "./storage.service";
import { EXCEL_UPLOAD_MAX_BYTES } from "@/lib/excel-import/upload-limits";

type MulterUploadedFile = {
  buffer: Buffer;
  mimetype?: string;
  size?: number;
};

@Controller("storage")
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly jwt: JwtService
  ) {}

  @Post("upload-url")
  @UseGuards(JwtAuthGuard)
  uploadUrl(@Body() body: { key: string; contentType: string }) {
    return this.storage.getUploadUrl(body.key, body.contentType);
  }

  @Post("download-url")
  @UseGuards(JwtAuthGuard)
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

  @Post("excel/direct-upload")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: EXCEL_UPLOAD_MAX_BYTES } })
  )
  async directUpload(
    @UploadedFile() file: MulterUploadedFile | undefined,
    @Body("storagePath") storagePath: string,
    @Body("connectionId") connectionId: string,
    @Headers("x-upload-token") uploadToken: string | undefined
  ) {
    if (!uploadToken?.trim()) {
      throw new UnauthorizedException("Falta token de subida");
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException("Archivo requerido");
    }
    if (!storagePath?.trim() || !connectionId?.trim()) {
      throw new BadRequestException("storagePath y connectionId son requeridos");
    }

    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(uploadToken);
    } catch {
      throw new UnauthorizedException("Token de subida inválido o expirado");
    }

    if (payload.purpose !== "excel-upload") {
      throw new UnauthorizedException("Token de subida inválido");
    }
    if (String(payload.key ?? "") !== storagePath.trim()) {
      throw new UnauthorizedException("Token no coincide con la ruta de almacenamiento");
    }
    if (String(payload.connectionId ?? "") !== connectionId.trim()) {
      throw new UnauthorizedException("Token no coincide con la conexión");
    }

    const expectedSize = Number(payload.fileSize ?? 0);
    const receivedSize = file.buffer.length;
    if (expectedSize > 0 && receivedSize !== expectedSize) {
      throw new BadRequestException(
        `Upload incompleto: se recibieron ${receivedSize} bytes y se esperaban ${expectedSize}.`
      );
    }

    await this.storage.putObject(storagePath.trim(), file.buffer, file.mimetype);
    const storedSize = await this.storage.getObjectContentLength(storagePath.trim());
    if (expectedSize > 0 && storedSize != null && storedSize !== expectedSize) {
      throw new BadRequestException(
        `El archivo en almacenamiento no coincide con el tamaño esperado (${storedSize} vs ${expectedSize} bytes).`
      );
    }
    return { ok: true, key: storagePath.trim(), bytesUploaded: receivedSize };
  }

  @Post("excel/process")
  @UseGuards(JwtAuthGuard)
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
