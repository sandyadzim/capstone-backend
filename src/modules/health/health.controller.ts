import { Controller, Get } from '@nestjs/common';
import { Public } from '@nestjs/authentication';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
