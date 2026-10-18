import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth-accounts/roles.decorator.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import { ApiErrorResponseDto } from '../../common/http/api-error.js';
import {
  DashboardSummaryResponseDto,
  DashboardTrendsResponseDto,
  MaintenanceHistoryResponseDto,
} from './dashboard-history.dto.js';
import {
  historyListSchema,
  dashboardTrendsSchema,
  historyUnitIdSchema,
} from './dashboard-history.schemas.js';
import type {
  HistoryListInput,
  DashboardTrendsInput,
  HistoryUnitIdInput,
} from './dashboard-history.schemas.js';
import { DashboardHistoryService } from './dashboard-history.service.js';

@Controller()
@ApiTags('Dashboard and history')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
export class DashboardHistoryController {
  constructor(private readonly dashboardHistory: DashboardHistoryService) {}

  @Get('units/:id/history')
  @Roles('ADMIN', 'RESIDENT')
  @ApiOperation({
    summary: 'List closed maintenance history for an accessible unit',
  })
  @ApiOkResponse({ type: MaintenanceHistoryResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
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
  listHistory(
    @CurrentUser() actor: AuthenticatedActor,
    @Param({ schema: historyUnitIdSchema }) params: HistoryUnitIdInput,
    @Query({ schema: historyListSchema }) input: HistoryListInput,
  ) {
    return this.dashboardHistory.listUnitHistory(actor, params.id, input);
  }

  @Get('dashboard/trends')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Read monthly reported/closed counts and closed maintenance costs in Asia/Jakarta, including archived units and zero months',
  })
  @ApiOkResponse({ type: DashboardTrendsResponseDto })
  @ApiQuery({
    name: 'months',
    required: false,
    description:
      'Calendar months ending with the current partial month; oldest first.',
    schema: { type: 'integer', minimum: 1, maximum: 12, default: 6 },
  })
  trends(
    @CurrentUser() actor: AuthenticatedActor,
    @Query({ schema: dashboardTrendsSchema }) input: DashboardTrendsInput,
  ) {
    return this.dashboardHistory.trends(actor, input);
  }

  @Get('dashboard/summary')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Read Admin maintenance dashboard metrics' })
  @ApiOkResponse({ type: DashboardSummaryResponseDto })
  summary(@CurrentUser() actor: AuthenticatedActor) {
    return this.dashboardHistory.summary(actor);
  }
}
