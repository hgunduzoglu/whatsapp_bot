import { Module } from '@nestjs/common';
import { ProductDebtsModule } from '../product-debts/product-debts.module';
import { ProductPaymentsController } from './product-payments.controller';
import { ProductPaymentsService } from './product-payments.service';

@Module({
  imports: [ProductDebtsModule],
  controllers: [ProductPaymentsController],
  providers: [ProductPaymentsService],
  exports: [ProductPaymentsService],
})
export class ProductPaymentsModule {}
