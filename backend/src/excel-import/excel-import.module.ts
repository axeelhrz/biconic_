import { Module } from "@nestjs/common";
import { ExcelImportInternalController } from "./excel-import-internal.controller";

@Module({
  controllers: [ExcelImportInternalController],
})
export class ExcelImportModule {}
