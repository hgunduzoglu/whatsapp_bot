import { Module } from '@nestjs/common';
import { MonetaryLedgerService } from './monetary-ledger.service';

@Module({
  providers: [MonetaryLedgerService],
  exports: [MonetaryLedgerService],
})
export class MonetaryLedgerModule {}
