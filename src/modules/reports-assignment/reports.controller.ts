import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DAMAGE_CATEGORIES, PRIORITIES } from '../database/schema.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import { Roles } from '../auth-accounts/roles.decorator.js';
import { ApiErrorResponseDto } from '../../common/http/api-error.js';
import {
  ReportDetailResponseDto,
  ReportListResponseDto,
} from './report.dto.js';
import {
  reportCreateSchema,
  reportIdSchema,
  reportListSchema,
} from './report.schemas.js';
import type {
  ReportCreateInput,
  ReportIdInput,
  ReportListInput,
} from './report.schemas.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@ApiTags('Reports')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiNotFoundResponse({ type: ApiErrorResponseDto })
@ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({
    summary: 'List reports visible to the authenticated actor',
  })
  @ApiOkResponse({ type: ReportListResponseDto })
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
  list(
    @CurrentUser() actor: AuthenticatedActor,
    @Query({ schema: reportListSchema }) input: ReportListInput,
  ) {
    return this.reports.list(actor, input);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read an accessible report' })
  @ApiOkResponse({ type: ReportDetailResponseDto })
  get(
    @CurrentUser() actor: AuthenticatedActor,
    @Param({ schema: reportIdSchema }) params: ReportIdInput,
  ) {
    return this.reports.get(actor, params.id);
  }

  @Post()
  @Roles('ADMIN', 'RESIDENT')
  @ApiOperation({
    summary: 'Create a damage report as an Admin or Resident',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['unitId', 'title', 'description', 'category', 'priority'],
      properties: {
        unitId: { type: 'string', format: 'uuid' },
        title: { type: 'string', minLength: 1, maxLength: 160 },
        description: { type: 'string', minLength: 1 },
        category: { type: 'string', enum: [...DAMAGE_CATEGORIES] },
        priority: { type: 'string', enum: [...PRIORITIES] },
      },
    },
  })
  @ApiCreatedResponse({ type: ReportDetailResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  create(
    @CurrentUser() actor: AuthenticatedActor,
    @Body({ schema: reportCreateSchema }) input: ReportCreateInput,
  ) {
    return this.reports.create(actor, input);
  }
}
