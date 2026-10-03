import { Body, Controller, Get, Patch } from '@nestjs/common';
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
import { Roles } from '../auth-accounts/roles.decorator.js';
import { ApiErrorResponseDto } from '../../common/http/api-error.js';
import { PropertyService } from './property.service.js';
import { PropertyResponseDto } from './property.dto.js';
import { propertyPatchSchema } from './property.schemas.js';
import type { PropertyPatchInput } from './property.schemas.js';

@Controller('property')
@ApiTags('Property')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@ApiNotFoundResponse({ type: ApiErrorResponseDto })
@ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
export class PropertyController {
  constructor(private readonly property: PropertyService) {}

  @Get()
  @ApiOperation({
    summary: 'Read the configured property (all authenticated roles)',
  })
  @ApiOkResponse({ type: PropertyResponseDto })
  get(): Promise<PropertyResponseDto> {
    return this.property.get();
  }

  @Patch()
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Update the property (Admin); logoUrl only accepts null to clear the logo',
  })
  @ApiOkResponse({ type: PropertyResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  update(
    @Body({ schema: propertyPatchSchema }) input: PropertyPatchInput,
  ): Promise<PropertyResponseDto> {
    return this.property.update(input);
  }
}
