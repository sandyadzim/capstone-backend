import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { ApiErrorResponseDto } from '../../common/http/api-error.js';
import type { AuthenticatedActor } from '../auth-accounts/authentication.types.js';
import { Roles } from '../auth-accounts/roles.decorator.js';
import { ResidentUnitResponseDto } from './unit.dto.js';
import { UnitsService } from './units.service.js';

const residentUnitQuerySchema = z.object({}).strict();

@Controller('resident/unit')
@Roles('RESIDENT')
@ApiTags('Units')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiBadRequestResponse({ type: ApiErrorResponseDto })
@ApiNotFoundResponse({ type: ApiErrorResponseDto })
@ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
export class ResidentUnitController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  @ApiOperation({
    summary: 'Read the current Resident unit, or null when unassigned',
  })
  @ApiOkResponse({ type: ResidentUnitResponseDto })
  get(
    @CurrentUser() actor: AuthenticatedActor,
    @Query({ schema: residentUnitQuerySchema })
    _query: z.infer<typeof residentUnitQuerySchema>,
  ): Promise<ResidentUnitResponseDto> {
    return this.units.getResidentUnit(actor.id);
  }
}
