import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  DamageCategory,
  DamageReportStatus,
  Priority,
} from '../database/schema.js';
import {
  COST_ITEM_TYPES,
  DAMAGE_CATEGORIES,
  DAMAGE_REPORT_STATUSES,
  PRIORITIES,
} from '../database/schema.js';

export class ReportUnitResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() unitNumber!: string;
  @ApiProperty({ type: 'integer' }) floor!: number;
}

export class ReportListItemResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() reportNumber!: string;
  @ApiProperty({ type: ReportUnitResponseDto }) unit!: ReportUnitResponseDto;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: DAMAGE_CATEGORIES }) category!: DamageCategory;
  @ApiProperty({ enum: PRIORITIES, nullable: true })
  proposedPriority!: Priority | null;
  @ApiProperty({ enum: PRIORITIES, nullable: true })
  finalPriority!: Priority | null;
  @ApiProperty({ enum: DAMAGE_REPORT_STATUSES }) status!: DamageReportStatus;
  @ApiProperty({ type: String, format: 'date-time' }) reportedAt!: Date;
}

export class ReportPaginationMetaDto {
  @ApiProperty({ type: 'integer', minimum: 1, default: 1 }) page!: number;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100, default: 20 })
  pageSize!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) total!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) totalPages!: number;
}

export class ReportListResponseDto {
  @ApiProperty({ type: [ReportListItemResponseDto] })
  data!: ReportListItemResponseDto[];
  @ApiProperty({ type: ReportPaginationMetaDto })
  meta!: ReportPaginationMetaDto;
}

export class ReportPersonResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}

export class ReportAssignmentResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: ReportPersonResponseDto, nullable: true })
  technician!: ReportPersonResponseDto | null;
  @ApiPropertyOptional({ type: ReportPersonResponseDto, nullable: true })
  assignedBy?: ReportPersonResponseDto | null;
  @ApiProperty({ type: String, format: 'date-time' }) assignedAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  estimatedArrivalAt!: Date | null;
  @ApiProperty({ nullable: true }) note!: string | null;
}

export class ReportPhotoResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fileUrl!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class MaintenanceResultResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() inspectionResult!: string;
  @ApiProperty() problemFound!: string;
  @ApiProperty() repairAction!: string;
  @ApiProperty({ type: String, nullable: true }) additionalNotes!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class CostItemResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: COST_ITEM_TYPES }) type!: 'SERVICE' | 'MATERIAL';
  @ApiProperty() description!: string;
  @ApiProperty({ type: String, example: '1.250' }) quantity!: string;
  @ApiProperty({ type: String, example: '125000.00' }) unitPrice!: string;
  @ApiProperty({ type: String, example: '156250.00' }) subtotal!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class ReportDetailResponseDto extends ReportListItemResponseDto {
  @ApiProperty() description!: string;
  @ApiProperty({ nullable: true }) rejectionReason!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  reviewNote?: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
  @ApiProperty({ type: ReportAssignmentResponseDto, nullable: true })
  assignment!: ReportAssignmentResponseDto | null;
  @ApiProperty({ type: [ReportPhotoResponseDto] })
  damagePhotos!: ReportPhotoResponseDto[];
  @ApiProperty({ type: [ReportPhotoResponseDto] })
  repairPhotos!: ReportPhotoResponseDto[];
  @ApiProperty({ type: ReportPhotoResponseDto, nullable: true })
  receipt!: ReportPhotoResponseDto | null;
  @ApiProperty({ type: MaintenanceResultResponseDto, nullable: true })
  maintenanceResult!: MaintenanceResultResponseDto | null;
  @ApiProperty({ type: String, example: '156250.00' }) totalCost!: string;
  @ApiPropertyOptional({ type: [CostItemResponseDto] })
  costItems?: CostItemResponseDto[];
  @ApiPropertyOptional({ type: ReportPersonResponseDto, nullable: true })
  createdBy?: ReportPersonResponseDto | null;
  @ApiPropertyOptional({ type: ReportPersonResponseDto, nullable: true })
  reportedBy?: ReportPersonResponseDto | null;
  @ApiPropertyOptional({ type: ReportPersonResponseDto, nullable: true })
  reviewedBy?: ReportPersonResponseDto | null;
  @ApiPropertyOptional({ type: ReportPersonResponseDto, nullable: true })
  closedBy?: ReportPersonResponseDto | null;
}
