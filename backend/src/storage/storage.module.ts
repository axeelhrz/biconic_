import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { DatabaseModule } from "../database/database.module";
import { StorageController } from "./storage.controller";
import { StorageService } from "./storage.service";
import { EXCEL_QUEUE } from "../etl/etl.constants";

@Module({
  imports: [DatabaseModule, BullModule.registerQueue({ name: EXCEL_QUEUE })],
  controllers: [StorageController],
  providers: [StorageService],
})
export class StorageModule {}
