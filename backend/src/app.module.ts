import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ConnectionsModule } from "./connections/connections.module";
import { EtlModule } from "./etl/etl.module";
import { StorageModule } from "./storage/storage.module";
import { AdminModule } from "./admin/admin.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? "redis://localhost:6379",
      },
    }),
    DatabaseModule,
    AuthModule,
    DashboardModule,
    ConnectionsModule,
    EtlModule,
    StorageModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
