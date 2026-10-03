import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ApiExceptionFilter } from './common/http/api-exception.filter.js';
import { AuthAccountsModule } from './modules/auth-accounts/auth-accounts.module.js';
import { AttachmentsModule } from './modules/attachments/attachments.module.js';
import { DashboardHistoryModule } from './modules/dashboard-history/dashboard-history.module.js';
import { DatabaseModule } from './modules/database/database.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MaintenanceExecutionModule } from './modules/maintenance-execution/maintenance-execution.module.js';
import { PropertyModule } from './modules/property/property.module.js';
import { UnitsModule } from './modules/units/units.module.js';
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
    PropertyModule,
    UnitsModule,
    ReportsAssignmentModule,
    MaintenanceExecutionModule,
    AttachmentsModule,
    DashboardHistoryModule,
    DatabaseModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}
