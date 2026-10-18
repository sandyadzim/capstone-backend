import { ApiProperty } from '@nestjs/swagger';
import type { DamageCategory, DamageReportStatus } from '../database/schema.js';
import {
  DAMAGE_CATEGORIES,
  DAMAGE_REPORT_STATUSES,
} from '../database/schema.js';
import { MaintenanceResultResponseDto } from '../reports-assignment/report.dto.js';

export class HistoryTechnicianResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}

export class MaintenanceHistoryItemResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() reportNumber!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: DAMAGE_CATEGORIES }) category!: DamageCategory;
  @ApiProperty({ type: String, format: 'date-time' }) reportedAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) closedAt!: Date;
  @ApiProperty({ type: HistoryTechnicianResponseDto, nullable: true })
  technician!: HistoryTechnicianResponseDto | null;
  @ApiProperty({ type: MaintenanceResultResponseDto, nullable: true })
  maintenanceResult!: InstanceType<typeof MaintenanceResultResponseDto> | null;
  @ApiProperty({ type: String, example: '156250.00' }) totalCost!: string;
  @ApiProperty({ enum: DAMAGE_REPORT_STATUSES }) status!: DamageReportStatus;
}

export class MaintenanceHistoryMetaResponseDto {
  @ApiProperty({ type: 'integer', minimum: 1, default: 1 }) page!: number;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100, default: 20 })
  pageSize!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) total!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) totalPages!: number;
}

export class MaintenanceHistoryResponseDto {
  @ApiProperty({ type: [MaintenanceHistoryItemResponseDto] })
  data!: MaintenanceHistoryItemResponseDto[];
  @ApiProperty({ type: MaintenanceHistoryMetaResponseDto })
  meta!: MaintenanceHistoryMetaResponseDto;
}

export class DashboardSummaryResponseDto {
  @ApiProperty({ type: 'integer', minimum: 0 }) totalUnits!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) totalReports!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) activeReports!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) inProgressReports!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) closedReportsThisMonth!: number;
  @ApiProperty({ type: String, example: '0.00' }) totalClosedCost!: string;
}

export class DashboardTrendMonthDto {
  @ApiProperty({
    type: String,
    pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$',
    example: '2026-10',
  })
  month!: string;
  @ApiProperty({ type: 'integer', minimum: 0 }) reportedCount!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) closedCount!: number;
  @ApiProperty({ type: String, example: '1250000.50' }) closedCost!: string;
}

export class DashboardTrendsResponseDto {
  @ApiProperty({ type: String, format: 'date-time' }) generatedAt!: Date;
  @ApiProperty({ type: String, enum: ['Asia/Jakarta'] })
  timeZone!: 'Asia/Jakarta';
  @ApiProperty({ type: [DashboardTrendMonthDto], minItems: 1, maxItems: 12 })
  months!: DashboardTrendMonthDto[];
}
