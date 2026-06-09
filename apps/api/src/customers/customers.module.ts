import { Module } from '@nestjs/common';
import { MonetaryLedgerModule } from '../monetary-ledger/monetary-ledger.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [MonetaryLedgerModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
