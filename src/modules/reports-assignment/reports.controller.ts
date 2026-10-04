import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
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
import {
  DAMAGE_CATEGORIES,
  DAMAGE_REPORT_STATUSES,
  PRIORITIES,
} from '../database/schema.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import { Roles } from '../auth-accounts/roles.decorator.js';
import { ApiErrorResponseDto } from '../../common/http/api-error.js';
import {
  ReportDetailResponseDto,
  ReportListResponseDto,
} from './report.dto.js';
import {
  reportCreateSchema,
  reportAssignSchema,
  reportIdSchema,
  reportListSchema,
  reportRejectSchema,
  reportVerifySchema,
} from './report.schemas.js';
import type {
  ReportCreateInput,
  ReportAssignInput,
  ReportIdInput,
  ReportListInput,
  ReportRejectInput,
  ReportVerifyInput,
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
  @ApiQuery({
    name: 'q',
    required: false,
    description:
      'Case-insensitive partial match against report number or title; maximum 160 characters.',
    schema: { type: 'string', maxLength: 160 },
  })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: [...DAMAGE_REPORT_STATUSES] },
  })
  @ApiQuery({
    name: 'category',
    required: false,
    schema: { type: 'string', enum: [...DAMAGE_CATEGORIES] },
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    description:
      'Matches final priority, or proposed priority when the report has not been reviewed.',
    schema: { type: 'string', enum: [...PRIORITIES] },
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description:
      'Inclusive calendar date in Asia/Jakarta (YYYY-MM-DD), applied to reportedAt.',
    schema: { type: 'string', format: 'date' },
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description:
      'Inclusive calendar date in Asia/Jakarta (YYYY-MM-DD), applied to reportedAt.',
    schema: { type: 'string', format: 'date' },
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

  @Post(':id/verify')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Verify a Resident report and set its final priority (Admin)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['finalPriority'],
      properties: {
        finalPriority: { type: 'string', enum: [...PRIORITIES] },
        reviewNote: { type: 'string', minLength: 1 },
      },
    },
  })
  @ApiOkResponse({ type: ReportDetailResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  verify(
    @CurrentUser() actor: AuthenticatedActor,
    @Param({ schema: reportIdSchema }) params: ReportIdInput,
    @Body({ schema: reportVerifySchema }) input: ReportVerifyInput,
  ) {
    return this.reports.verify(actor, params.id, input);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Reject a Resident report with a reason (Admin)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['finalPriority', 'rejectionReason'],
      properties: {
        finalPriority: { type: 'string', enum: [...PRIORITIES] },
        rejectionReason: { type: 'string', minLength: 1 },
        reviewNote: { type: 'string', minLength: 1 },
      },
    },
  })
  @ApiOkResponse({ type: ReportDetailResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  reject(
    @CurrentUser() actor: AuthenticatedActor,
    @Param({ schema: reportIdSchema }) params: ReportIdInput,
    @Body({ schema: reportRejectSchema }) input: ReportRejectInput,
  ) {
    return this.reports.reject(actor, params.id, input);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Assign an active Technician to a verified report (Admin)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['technicianUserId'],
      properties: {
        technicianUserId: { type: 'string', format: 'uuid' },
        note: { type: 'string', minLength: 1 },
      },
    },
  })
  @ApiOkResponse({ type: ReportDetailResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  assign(
    @CurrentUser() actor: AuthenticatedActor,
    @Param({ schema: reportIdSchema }) params: ReportIdInput,
    @Body({ schema: reportAssignSchema }) input: ReportAssignInput,
  ) {
    return this.reports.assign(actor, params.id, input);
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
