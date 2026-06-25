import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { DatabaseModule } from "../database/database.module";
import { EtlController } from "./etl.controller";
import { EtlService } from "./etl.service";
import { ETL_QUEUE } from "./etl.constants";

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({ name: ETL_QUEUE }),
  ],
  controllers: [EtlController],
  providers: [EtlService],
  exports: [EtlService],
})
export class EtlModule {}
