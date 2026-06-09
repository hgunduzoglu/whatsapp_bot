import { Module } from '@nestjs/common';
import { MonetaryLedgerModule } from '../monetary-ledger/monetary-ledger.module';
import { ProductDebtsModule } from '../product-debts/product-debts.module';
import { ProductPaymentsModule } from '../product-payments/product-payments.module';
import { PromissoryNotesModule } from '../promissory-notes/promissory-notes.module';
import { SeedlingsModule } from '../seedlings/seedlings.module';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    MonetaryLedgerModule,
    ProductDebtsModule,
    ProductPaymentsModule,
    SeedlingsModule,
    PromissoryNotesModule,
  ],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
