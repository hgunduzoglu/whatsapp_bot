import { Module } from '@nestjs/common';
import { MonetaryLedgerController } from './monetary-ledger.controller';
import { MonetaryLedgerService } from './monetary-ledger.service';

@Module({
  controllers: [MonetaryLedgerController],
  providers: [MonetaryLedgerService],
  exports: [MonetaryLedgerService],
})
export class MonetaryLedgerModule {}
