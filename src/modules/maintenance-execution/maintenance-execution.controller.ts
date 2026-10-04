import { Body, Controller, HttpCode, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../common/http/api-error.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import { Roles } from '../auth-accounts/roles.decorator.js';
import { ReportDetailResponseDto } from '../reports-assignment/report.dto.js';
import { reportIdSchema } from '../reports-assignment/report.schemas.js';
import type { ReportIdInput } from '../reports-assignment/report.schemas.js';
import {
  completeWorkSchema,
  costItemsSchema,
  maintenanceResultSchema,
  startWorkSchema,
} from './maintenance-execution.schemas.js';
import type {
  CostItemsInput,
  MaintenanceResultInput,
  StartWorkInput,
} from './maintenance-execution.schemas.js';
import { MaintenanceExecutionService } from './maintenance-execution.service.js';

@Controller('reports')
@ApiTags('Maintenance execution')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiNotFoundResponse({ type: ApiErrorResponseDto })
@ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
export class MaintenanceExecutionController {
  constructor(private readonly maintenance: MaintenanceExecutionService) {}

  @Post(':id/start')
  @HttpCode(200)
  @Roles('TECHNICIAN')
  @ApiOperation({
    summary: 'Start assigned work with an estimated arrival time (Technician)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['estimatedArrivalAt'],
      properties: {
        estimatedArrivalAt: {
          type: 'string',
          format: 'date-time',
          description: 'ISO 8601 timestamp with Z or an explicit UTC offset',
          example: '2026-10-04T14:30:00+07:00',
        },
      },
    },
  })
  @ApiOkResponse({ type: ReportDetailResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  start(
    @CurrentUser() actor: AuthenticatedActor,
    @Param({ schema: reportIdSchema }) params: ReportIdInput,
    @Body({ schema: startWorkSchema }) input: StartWorkInput,
  ) {
    return this.maintenance.start(actor, params.id, input);
  }

  @Put(':id/result')
  @Roles('TECHNICIAN')
  @ApiOperation({ summary: 'Save or replace assigned work result' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['inspectionResult', 'problemFound', 'repairAction'],
      properties: {
        inspectionResult: { type: 'string', minLength: 1 },
        problemFound: { type: 'string', minLength: 1 },
        repairAction: { type: 'string', minLength: 1 },
        additionalNotes: { type: 'string', nullable: true },
      },
    },
  })
  @ApiOkResponse({ type: ReportDetailResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  saveResult(
    @CurrentUser() actor: AuthenticatedActor,
    @Param({ schema: reportIdSchema }) params: ReportIdInput,
    @Body({ schema: maintenanceResultSchema }) input: MaintenanceResultInput,
  ) {
    return this.maintenance.saveResult(actor, params.id, input);
  }

  @Put(':id/cost-items')
  @Roles('TECHNICIAN')
  @ApiOperation({ summary: 'Replace maintenance cost items' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'description', 'quantity', 'unitPrice'],
            properties: {
              type: { type: 'string', enum: ['SERVICE', 'MATERIAL'] },
              description: { type: 'string', minLength: 1, maxLength: 240 },
              quantity: { type: 'string', example: '1.250' },
              unitPrice: { type: 'string', example: '125000.00' },
            },
          },
        },
      },
    },
  })
  @ApiOkResponse({ type: ReportDetailResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  saveCostItems(
    @CurrentUser() actor: AuthenticatedActor,
    @Param({ schema: reportIdSchema }) params: ReportIdInput,
    @Body({ schema: costItemsSchema }) input: CostItemsInput,
  ) {
    return this.maintenance.saveCostItems(actor, params.id, input);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @Roles('TECHNICIAN')
  @ApiOperation({ summary: 'Submit completed assigned maintenance work' })
  @ApiBody({
    required: false,
    schema: { type: 'object', additionalProperties: false },
  })
  @ApiOkResponse({ type: ReportDetailResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  complete(
    @CurrentUser() actor: AuthenticatedActor,
    @Param({ schema: reportIdSchema }) params: ReportIdInput,
    @Body({ schema: completeWorkSchema }) _input: Record<string, never>,
  ) {
    return this.maintenance.complete(actor, params.id);
  }

  @Post(':id/close')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Approve and close completed maintenance work (Admin)',
  })
  @ApiBody({
    required: false,
    schema: { type: 'object', additionalProperties: false },
  })
  @ApiOkResponse({ type: ReportDetailResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  close(
    @CurrentUser() actor: AuthenticatedActor,
    @Param({ schema: reportIdSchema }) params: ReportIdInput,
    @Body({ schema: completeWorkSchema }) _input: Record<string, never>,
  ) {
    return this.maintenance.close(actor, params.id);
  }
}
