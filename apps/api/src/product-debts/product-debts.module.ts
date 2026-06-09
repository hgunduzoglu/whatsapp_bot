import { Module } from '@nestjs/common';
import { ProductDebtsController } from './product-debts.controller';
import { ProductDebtsService } from './product-debts.service';

@Module({
  controllers: [ProductDebtsController],
  providers: [ProductDebtsService],
  exports: [ProductDebtsService],
})
export class ProductDebtsModule {}
