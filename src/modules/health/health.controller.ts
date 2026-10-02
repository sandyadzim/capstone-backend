import { Controller, Get } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../common/http/api-error.js';

class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';
}

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Check API availability' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  getHealth(): HealthResponseDto {
    return { status: 'ok' };
  }
}
