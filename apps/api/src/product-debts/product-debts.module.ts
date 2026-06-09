import { Module } from '@nestjs/common';
import { ProductDebtsService } from './product-debts.service';

@Module({
  providers: [ProductDebtsService],
  exports: [ProductDebtsService],
})
export class ProductDebtsModule {}
