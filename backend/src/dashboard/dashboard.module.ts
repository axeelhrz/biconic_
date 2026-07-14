import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { DashboardsListController } from "./dashboards-list.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  controllers: [DashboardController, DashboardsListController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
