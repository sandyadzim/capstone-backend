import { ApiProperty } from '@nestjs/swagger';

export const UNIT_DISPLAY_STATUSES = [
  'MAINTENANCE',
  'OCCUPIED',
  'VACANT',
] as const;
export class ActiveResidentResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ maxLength: 254 }) loginIdentifier!: string;
}
export class UnitResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) propertyId!: string;
  @ApiProperty({ maxLength: 40 }) unitNumber!: string;
  @ApiProperty({ type: 'integer', minimum: -32768, maximum: 32767 })
  floor!: number;
  @ApiProperty() maintenanceFlag!: boolean;
  @ApiProperty() isArchived!: boolean;
  @ApiProperty({ enum: UNIT_DISPLAY_STATUSES })
  displayStatus!: (typeof UNIT_DISPLAY_STATUSES)[number];
  @ApiProperty({ type: ActiveResidentResponseDto, nullable: true })
  activeResident!: ActiveResidentResponseDto | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}
export class UnitPaginationMetaDto {
  @ApiProperty({ type: 'integer', minimum: 1, default: 1 }) page!: number;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100, default: 20 })
  pageSize!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) total!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) totalPages!: number;
}
export class UnitListResponseDto {
  @ApiProperty({ type: [UnitResponseDto] }) data!: UnitResponseDto[];
  @ApiProperty({ type: UnitPaginationMetaDto }) meta!: UnitPaginationMetaDto;
}
