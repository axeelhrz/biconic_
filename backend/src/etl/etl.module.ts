import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { DatabaseModule } from "../database/database.module";
import { EtlController } from "./etl.controller";
import { EtlInternalController } from "./etl-internal.controller";
import { JoinQueryInternalController } from "./join-query-internal.controller";
import { EtlService } from "./etl.service";
import { ETL_QUEUE } from "./etl.constants";

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({ name: ETL_QUEUE }),
  ],
  controllers: [EtlController, EtlInternalController, JoinQueryInternalController],
  providers: [EtlService],
  exports: [EtlService],
})
export class EtlModule {}
