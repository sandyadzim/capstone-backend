import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
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
import { startWorkSchema } from './maintenance-execution.schemas.js';
import type { StartWorkInput } from './maintenance-execution.schemas.js';
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
}
