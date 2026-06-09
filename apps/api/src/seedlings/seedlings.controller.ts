import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MonetaryLedgerEntry, SeedlingOrder, SeedlingOrderStatus, SeedUnit } from '@prisma/client';
import { z } from 'zod';
import { adminActor, CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-auth.guard';
import { formatKurus } from '../common/utils/money.util';
import { dateString, positiveInt } from '../common/rest.util';
import { zParse } from '../common/zod-validation';
import { SeedlingsService } from './seedlings.service';

const createOrderSchema = z.object({
  plantName: z.string().min(1).max(120),
  seedGiven: z.boolean(),
  seedPlantName: z.string().max(120).nullish(),
  seedAmount: z.number().positive().nullish(),
  seedUnit: z.nativeEnum(SeedUnit).nullish(),
  requestedPickupDate: dateString,
  note: z.string().max(300).nullish(),
});

const seedlingDebtSchema = z.object({
  plantName: z.string().min(1).max(120),
  unitPriceKurus: positiveInt,
  seedlingCount: positiveInt.max(1_000_000),
  relatedOrderId: z.string().nullish(),
});

const voidSchema = z.object({ reason: z.string().max(300).nullish() });

@Controller()
export class SeedlingsController {
  constructor(private readonly seedlings: SeedlingsService) {}

  /** Open orders due within the next `days` days (default 30). */
  @Get('seedling-orders')
  async upcoming(@Query('days') days?: string): Promise<SeedlingOrder[]> {
    const parsed = zParse(z.coerce.number().int().min(1).max(365).default(30), days);
    return this.seedlings.upcomingOrders(parsed);
  }

  @Get('customers/:id/seedling-orders')
  async forCustomer(@Param('id') customerId: string): Promise<SeedlingOrder[]> {
    return this.seedlings.ordersForCustomer(customerId);
  }

  @Post('customers/:id/seedling-orders')
  async create(
    @Param('id') customerId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<SeedlingOrder> {
    const input = zParse(createOrderSchema, body);
    return this.seedlings.createOrder({
      customerId,
      ...input,
      actorPhone: adminActor(user),
    });
  }

  @Post('seedling-orders/:id/mark-delivered')
  async markDelivered(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SeedlingOrder> {
    return this.seedlings.markStatus(id, SeedlingOrderStatus.DELIVERED, adminActor(user));
  }

  @Post('seedling-orders/:id/void')
  async voidOrder(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ ok: true }> {
    const { reason } = zParse(voidSchema, body ?? {});
    await this.seedlings.voidOrder(id, reason ?? null, adminActor(user));
    return { ok: true };
  }

  @Post('customers/:id/seedling-debts')
  async createDebt(
    @Param('id') customerId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<MonetaryLedgerEntry> {
    const input = zParse(seedlingDebtSchema, body);
    const description = `${input.plantName} fidesi ${input.seedlingCount} x ${formatKurus(input.unitPriceKurus)}`;
    return this.seedlings.createSeedlingDebt({
      customerId,
      relatedOrderId: input.relatedOrderId ?? null,
      plantName: input.plantName,
      unitPriceKurus: input.unitPriceKurus,
      seedlingCount: input.seedlingCount,
      description,
      actorPhone: adminActor(user),
    });
  }
}
