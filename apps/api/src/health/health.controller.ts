import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string; time: string } {
    return {
      status: 'ok',
      time: new Date().toISOString(),
    };
  }
}
