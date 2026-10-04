import { Module } from '@nestjs/common';
import { DashboardHistoryController } from './dashboard-history.controller.js';
import { DashboardHistoryRepository } from './dashboard-history.repository.js';
import { DashboardHistoryService } from './dashboard-history.service.js';

@Module({
  controllers: [DashboardHistoryController],
  providers: [DashboardHistoryService, DashboardHistoryRepository],
})
export class DashboardHistoryModule {}
