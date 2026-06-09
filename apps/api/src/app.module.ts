import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AppConfigModule } from './config/app-config.module';
import { CustomersModule } from './customers/customers.module';
import { HealthModule } from './health/health.module';
import { MonetaryLedgerModule } from './monetary-ledger/monetary-ledger.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    AuditModule,
    HealthModule,
    CustomersModule,
    MonetaryLedgerModule,
  ],
})
export class AppModule {}
