import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  HttpCode,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { Roles } from '../auth-accounts/roles.decorator.js';
import { ApiErrorResponseDto } from '../../common/http/api-error.js';
import { UnitsService } from './units.service.js';
import { ResidentPlacementService } from './resident-placement.service.js';
import {
  UnitListResponseDto,
  UnitResponseDto,
  UNIT_DISPLAY_STATUSES,
} from './unit.dto.js';
import {
  unitIdSchema,
  unitCreateSchema,
  unitPatchSchema,
  unitListSchema,
  residentPlacementSchema,
} from './unit.schemas.js';
import type {
  UnitIdInput,
  UnitCreateInput,
  UnitPatchInput,
  UnitListInput,
  ResidentPlacementInput,
} from './unit.schemas.js';

@Controller('units')
@Roles('ADMIN')
@ApiTags('Units')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiNotFoundResponse({ type: ApiErrorResponseDto })
@ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
export class UnitsController {
  constructor(
    private readonly units: UnitsService,
    private readonly placement: ResidentPlacementService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List property units (Admin), newest first (createdAt DESC, id DESC)',
  })
  @ApiOkResponse({ type: UnitListResponseDto })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', minimum: 1, default: 1 },
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({
    name: 'isArchived',
    required: false,
    schema: { type: 'string', enum: ['true', 'false'], default: 'false' },
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description:
      'Case-insensitive literal substring of unitNumber; trimmed, blank means no search',
    schema: { type: 'string', maxLength: 40 },
  })
  @ApiQuery({
    name: 'displayStatus',
    required: false,
    description:
      'Computed unit status; maintenance takes precedence over active resident occupancy',
    schema: { type: 'string', enum: [...UNIT_DISPLAY_STATUSES] },
  })
  list(
    @Query({ schema: unitListSchema }) input: UnitListInput,
  ): Promise<UnitListResponseDto> {
    return this.units.list(input);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a unit, including archived units (Admin)' })
  @ApiOkResponse({ type: UnitResponseDto })
  get(
    @Param({ schema: unitIdSchema }) params: UnitIdInput,
  ): Promise<UnitResponseDto> {
    return this.units.get(params.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an empty unit (Admin)' })
  @ApiCreatedResponse({ type: UnitResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  create(
    @Body({ schema: unitCreateSchema }) input: UnitCreateInput,
  ): Promise<UnitResponseDto> {
    return this.units.create(input);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an unarchived unit (Admin)' })
  @ApiOkResponse({ type: UnitResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  update(
    @Param({ schema: unitIdSchema }) params: UnitIdInput,
    @Body({ schema: unitPatchSchema }) input: UnitPatchInput,
  ): Promise<UnitResponseDto> {
    return this.units.update(params.id, input);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Archive an empty unit with no active reports (Admin); idempotent',
  })
  @ApiOkResponse({ type: UnitResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  archive(
    @Param({ schema: unitIdSchema }) params: UnitIdInput,
  ): Promise<UnitResponseDto> {
    return this.units.archive(params.id);
  }

  @Put(':id/resident')
  @ApiOperation({
    summary:
      'Place or atomically move an active resident (Admin); occupied destinations conflict',
  })
  @ApiOkResponse({ type: UnitResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  place(
    @Param({ schema: unitIdSchema }) params: UnitIdInput,
    @Body({ schema: residentPlacementSchema }) input: ResidentPlacementInput,
  ): Promise<UnitResponseDto> {
    return this.placement.place(
      params.id,
      input.residentUserId,
      undefined,
      input.unassignedOnly,
    );
  }

  @Delete(':id/resident')
  @ApiOperation({
    summary:
      'Release the resident without deactivating the account (Admin); idempotent',
  })
  @ApiOkResponse({ type: UnitResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  release(
    @Param({ schema: unitIdSchema }) params: UnitIdInput,
  ): Promise<UnitResponseDto> {
    return this.placement.release(params.id);
  }
}
