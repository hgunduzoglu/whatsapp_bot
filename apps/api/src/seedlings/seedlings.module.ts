import { Module } from '@nestjs/common';
import { MonetaryLedgerModule } from '../monetary-ledger/monetary-ledger.module';
import { RemindersModule } from '../reminders/reminders.module';
import { SeedlingsService } from './seedlings.service';

@Module({
  imports: [MonetaryLedgerModule, RemindersModule],
  providers: [SeedlingsService],
  exports: [SeedlingsService],
})
export class SeedlingsModule {}
