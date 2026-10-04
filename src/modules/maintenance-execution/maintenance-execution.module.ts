import { Module } from '@nestjs/common';
import { ReportsAssignmentModule } from '../reports-assignment/reports-assignment.module.js';
import { MaintenanceExecutionController } from './maintenance-execution.controller.js';
import { MaintenanceExecutionRepository } from './maintenance-execution.repository.js';
import { MaintenanceExecutionService } from './maintenance-execution.service.js';

@Module({
  imports: [ReportsAssignmentModule],
  controllers: [MaintenanceExecutionController],
  providers: [MaintenanceExecutionService, MaintenanceExecutionRepository],
})
export class MaintenanceExecutionModule {}
