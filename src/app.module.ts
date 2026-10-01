import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthAccountsModule } from './modules/auth-accounts/auth-accounts.module.js';
import { AttachmentsModule } from './modules/attachments/attachments.module.js';
import { DashboardHistoryModule } from './modules/dashboard-history/dashboard-history.module.js';
import { DatabaseModule } from './modules/database/database.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MaintenanceExecutionModule } from './modules/maintenance-execution/maintenance-execution.module.js';
import { PropertyUnitsModule } from './modules/property-units/property-units.module.js';
import { ReportsAssignmentModule } from './modules/reports-assignment/reports-assignment.module.js';
import { validateEnvironment } from './config/environment.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    HealthModule,
    AuthAccountsModule,
    PropertyUnitsModule,
    ReportsAssignmentModule,
    MaintenanceExecutionModule,
    AttachmentsModule,
    DashboardHistoryModule,
    DatabaseModule,
  ],
})
export class AppModule {}
