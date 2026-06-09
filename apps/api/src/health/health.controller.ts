import { Controller, Get, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';

interface HealthReport {
  status: 'ok' | 'degraded';
  database: 'ok' | 'error';
  redis: 'ok' | 'error';
  time: string;
}

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    return {
      status: database === 'ok' && redis === 'ok' ? 'ok' : 'degraded',
      database,
      redis,
      time: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    try {
      await this.redis.ping();
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
