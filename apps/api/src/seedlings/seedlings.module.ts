import { Module } from '@nestjs/common';
import { MonetaryLedgerModule } from '../monetary-ledger/monetary-ledger.module';
import { RemindersModule } from '../reminders/reminders.module';
import { SeedlingsController } from './seedlings.controller';
import { SeedlingsService } from './seedlings.service';

@Module({
  imports: [MonetaryLedgerModule, RemindersModule],
  controllers: [SeedlingsController],
  providers: [SeedlingsService],
  exports: [SeedlingsService],
})
export class SeedlingsModule {}
