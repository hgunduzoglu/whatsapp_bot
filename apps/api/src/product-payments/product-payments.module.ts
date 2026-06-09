import { Module } from '@nestjs/common';
import { ProductDebtsModule } from '../product-debts/product-debts.module';
import { ProductPaymentsService } from './product-payments.service';

@Module({
  imports: [ProductDebtsModule],
  providers: [ProductPaymentsService],
  exports: [ProductPaymentsService],
})
export class ProductPaymentsModule {}
