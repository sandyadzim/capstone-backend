import { ApiProperty } from '@nestjs/swagger';
import { USER_ROLES } from '../database/schema.js';

export class AccountUnitResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ maxLength: 40 }) unitNumber!: string;
  @ApiProperty({ type: 'integer', minimum: -32768, maximum: 32767 })
  floor!: number;
}

export class AccountResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ maxLength: 160 }) name!: string;
  @ApiProperty({ maxLength: 254 }) loginIdentifier!: string;
  @ApiProperty({ enum: USER_ROLES }) role!: (typeof USER_ROLES)[number];
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: AccountUnitResponseDto, nullable: true })
  activeUnit!: AccountUnitResponseDto | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class AccountPaginationMetaDto {
  @ApiProperty({ type: 'integer', minimum: 1, default: 1 }) page!: number;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100, default: 20 })
  pageSize!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) total!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) totalPages!: number;
}

export class AccountListResponseDto {
  @ApiProperty({ type: [AccountResponseDto] }) data!: AccountResponseDto[];
  @ApiProperty({ type: AccountPaginationMetaDto })
  meta!: AccountPaginationMetaDto;
}
