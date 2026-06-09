import { Module } from '@nestjs/common';
import { MonetaryLedgerModule } from '../monetary-ledger/monetary-ledger.module';
import { SeedlingsService } from './seedlings.service';

@Module({
  imports: [MonetaryLedgerModule],
  providers: [SeedlingsService],
  exports: [SeedlingsService],
})
export class SeedlingsModule {}
