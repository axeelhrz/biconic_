import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { runProcessExcelImport, type ParseMode } from "@/lib/excel-import/process-data-import";

@Controller("internal/excel")
export class ExcelImportInternalController {
  @Post("run-import")
  async runImport(
    @Body()
    body: {
      connectionId?: string;
      dataTableId?: string;
      parseMode?: ParseMode;
      selectedSheet?: string | null;
      continuation?: boolean;
    },
    @Headers("x-internal-process-excel") internalSecret?: string
  ) {
    const expected = process.env.INTERNAL_PROCESS_EXCEL_SECRET?.trim();
    if (expected && internalSecret !== expected) {
      throw new UnauthorizedException("No autorizado");
    }

    if (!body?.connectionId || !body?.dataTableId) {
      throw new UnauthorizedException("Faltan connectionId o dataTableId");
    }

    const parseMode: ParseMode =
      body.parseMode === "strict" ||
      body.parseMode === "tolerant" ||
      body.parseMode === "mixed"
        ? body.parseMode
        : "mixed";
    const selectedSheet =
      typeof body.selectedSheet === "string" && body.selectedSheet.trim() !== ""
        ? body.selectedSheet.trim()
        : null;

    void runProcessExcelImport({
      connectionId: body.connectionId,
      dataTableId: body.dataTableId,
      parseMode,
      selectedSheet,
      continuation: Boolean(body.continuation),
    }).catch(async (err) => {
      console.error("[excel-import/run-import]", err);
      try {
        const { createImportAdminClient } = await import(
          "@/lib/excel-import/import-admin-client"
        );
        const admin = createImportAdminClient();
        await admin
          .from("data_tables")
          .update({
            import_status: "failed",
            error_message: err instanceof Error ? err.message : String(err),
          })
          .eq("id", body.dataTableId!);
      } catch (_) {}
    });

    return { ok: true, status: "started" };
  }
}
