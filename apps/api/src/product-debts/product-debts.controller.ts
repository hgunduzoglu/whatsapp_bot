import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ProductCategory, QuantityUnit } from '@prisma/client';
import { z } from 'zod';
import { adminActor, CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-auth.guard';
import { dateString, positiveInt } from '../common/rest.util';
import { zParse } from '../common/zod-validation';
import { ProductDebtsService, PurchaseWithItems } from './product-debts.service';

const createSchema = z.object({
  items: z
    .array(
      z.object({
        productName: z.string().min(1).max(120),
        category: z.nativeEnum(ProductCategory),
        quantity: z.number().positive().max(1_000_000),
        unit: z.nativeEnum(QuantityUnit),
      }),
    )
    .min(1),
  note: z.string().max(300).nullish(),
  estimatedAmountKurus: positiveInt.nullish(),
  businessDate: dateString.optional(),
});

const voidSchema = z.object({ reason: z.string().max(300).nullish() });
const deleteSchema = z.object({ reason: z.string().min(1).max(300) });

@Controller()
export class ProductDebtsController {
  constructor(private readonly productDebts: ProductDebtsService) {}

  @Get('customers/:id/product-debts')
  async list(@Param('id') customerId: string): Promise<PurchaseWithItems[]> {
    return this.productDebts.purchasesForCustomer(customerId);
  }

  @Post('customers/:id/product-debts')
  async create(
    @Param('id') customerId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<PurchaseWithItems> {
    const input = zParse(createSchema, body);
    return this.productDebts.createPurchase({
      customerId,
      ...input,
      actorPhone: adminActor(user),
    });
  }

  @Get('product-debts/:id')
  async get(@Param('id') id: string): Promise<PurchaseWithItems> {
    return this.productDebts.getPurchaseById(id);
  }

  @Post('product-debts/:id/void')
  async voidPurchase(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ ok: true }> {
    const { reason } = zParse(voidSchema, body ?? {});
    await this.productDebts.voidPurchase(id, reason ?? null, adminActor(user));
    return { ok: true };
  }

  @Delete('product-debts/:id')
  async deletePurchase(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ ok: true }> {
    const { reason } = zParse(deleteSchema, body);
    await this.productDebts.softDeletePurchase(id, reason, adminActor(user));
    return { ok: true };
  }
}
