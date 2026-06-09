import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { adminActor, CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-auth.guard';
import { dateString, positiveInt } from '../common/rest.util';
import { zParse } from '../common/zod-validation';
import { PaymentWithItems, ProductPaymentsService } from './product-payments.service';

const createSchema = z.object({
  allocations: z
    .array(
      z.object({
        productPurchaseItemId: z.string().min(1),
        paidQuantity: z.number().positive().max(1_000_000),
        amountKurus: positiveInt.nullish(),
      }),
    )
    .min(1),
  note: z.string().max(300).nullish(),
  businessDate: dateString.optional(),
});

const voidSchema = z.object({ reason: z.string().max(300).nullish() });
const deleteSchema = z.object({ reason: z.string().min(1).max(300) });

@Controller()
export class ProductPaymentsController {
  constructor(private readonly productPayments: ProductPaymentsService) {}

  @Get('customers/:id/product-payments')
  async list(@Param('id') customerId: string): Promise<PaymentWithItems[]> {
    return this.productPayments.paymentsForCustomer(customerId);
  }

  @Post('customers/:id/product-payments')
  async create(
    @Param('id') customerId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaymentWithItems> {
    const input = zParse(createSchema, body);
    return this.productPayments.createPayment({
      customerId,
      ...input,
      actorPhone: adminActor(user),
    });
  }

  @Post('product-payments/:id/void')
  async voidPayment(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ ok: true }> {
    const { reason } = zParse(voidSchema, body ?? {});
    await this.productPayments.voidPayment(id, reason ?? null, adminActor(user));
    return { ok: true };
  }

  @Delete('product-payments/:id')
  async deletePayment(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ ok: true }> {
    const { reason } = zParse(deleteSchema, body);
    await this.productPayments.softDeletePayment(id, reason, adminActor(user));
    return { ok: true };
  }
}
